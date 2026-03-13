/**
 * LineUnifiedInbox - Cloudflare Worker
 * Handles Line webhook, chats list, messages, and reply API
 */

import { Hono } from "hono";
import type { Env } from "../env";
import { cors } from "hono/cors";
import { Client } from "@line/bot-sdk";

// Types
interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  source: { userId?: string; type: string };
  message?: { type: string; id: string; text?: string };
  timestamp: number;
}

interface LineWebhookBody {
  events: LineWebhookEvent[];
}

// Verify Line webhook signature (HMAC-SHA256)
async function verifyLineSignature(
  body: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature || !body) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(body)
  );
  const expected = btoa(String.fromCharCode(...Array.from(new Uint8Array(sig))));
  return signature === expected;
}

// Supabase client for Worker (uses service role to bypass RLS)
function getSupabaseClient(baseUrl: string, serviceKey: string) {
  return {
    async insertMessage(data: {
      line_user_id: string;
      sender_type: "user" | "admin";
      content: string;
      message_id?: string;
    }) {
      const res = await fetch(`${baseUrl}/rest/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Supabase insert failed: ${err}`);
      }
    },
    async upsertLineUser(data: {
      line_user_id: string;
      profile_name?: string;
      avatar?: string;
      last_active: string;
    }) {
      const res = await fetch(`${baseUrl}/rest/v1/line_users?on_conflict=line_user_id`, {
        method: "UPSERT",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Supabase upsert failed: ${err}`);
      }
    },
  };
}

const app = new Hono<{ Bindings: Env }>();

// CORS for frontend
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "http://localhost:3000";
      if (
        origin.startsWith("http://localhost") ||
        origin.startsWith("http://127.0.0.1") ||
        origin.endsWith(".pages.dev")
      )
        return origin;
      return "http://localhost:3000";
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// POST /webhook - Line webhook receiver
app.post("/webhook", async (c) => {
  const secret = c.env.LINE_CHANNEL_SECRET as string;
  const supabaseUrl = c.env.SUPABASE_URL as string;
  const supabaseServiceKey = c.env.SUPABASE_SERVICE_ROLE_KEY as string;

  if (!secret || !supabaseUrl || !supabaseServiceKey) {
    return c.json({ error: "Missing env configuration" }, 500);
  }

  const signature = c.req.header("x-line-signature");
  const rawBody = await c.req.text();

  const isValid = await verifyLineSignature(rawBody, signature, secret);
  if (!isValid) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  let body: LineWebhookBody;
  try {
    body = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  if (!body.events || !Array.isArray(body.events)) {
    return c.json({ ok: true }); // Line expects 200
  }

  const supabase = getSupabaseClient(supabaseUrl, supabaseServiceKey);

  for (const event of body.events) {
    if (event.type !== "message" || event.message?.type !== "text") continue;
    const userId = event.source?.userId;
    if (!userId) continue;

    const content = event.message.text || "";
    const messageId = event.message.id;
    const now = new Date().toISOString();

    await supabase.upsertLineUser({
      line_user_id: userId,
      last_active: now,
    });

    await supabase.insertMessage({
      line_user_id: userId,
      sender_type: "user",
      content,
      message_id: messageId,
    });
  }

  return c.json({ ok: true });
});

// GET /chats - List users with last message (for sidebar)
app.get("/chats", async (c) => {
  const supabaseUrl = c.env.SUPABASE_URL as string;
  const supabaseAnonKey = c.env.SUPABASE_ANON_KEY as string;
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);

  // Verify token with Supabase
  const { data: { user }, error: authError } = await fetch(
    `${supabaseUrl}/auth/v1/user`,
    { headers: { Authorization: `Bearer ${token}` } }
  ).then((r) => r.json());

  if (authError || !user) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/line_users?order=last_active.desc&select=id,line_user_id,profile_name,avatar,last_active`,
    {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    return c.json({ error: "Failed to fetch chats" }, 500);
  }

  const users = await res.json();

  // Get last message per user
  const usersWithLastMessage = await Promise.all(
    users.map(async (u: { line_user_id: string }) => {
      const msgRes = await fetch(
        `${supabaseUrl}/rest/v1/messages?line_user_id=eq.${u.line_user_id}&order=timestamp.desc&limit=1&select=content,timestamp,sender_type`,
        {
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const msgs = msgRes.ok ? await msgRes.json() : [];
      return { ...u, last_message: msgs[0] || null };
    })
  );

  return c.json(usersWithLastMessage);
});

// GET /messages/:userId - Chat history for a user
app.get("/messages/:userId", async (c) => {
  const userId = c.req.param("userId");
  const supabaseUrl = c.env.SUPABASE_URL as string;
  const supabaseAnonKey = c.env.SUPABASE_ANON_KEY as string;
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);

  const { error: authError } = await fetch(
    `${supabaseUrl}/auth/v1/user`,
    { headers: { Authorization: `Bearer ${token}` } }
  ).then((r) => r.json());

  if (authError) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/messages?line_user_id=eq.${encodeURIComponent(userId)}&order=timestamp.asc&select=id,line_user_id,sender_type,content,timestamp`,
    {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    return c.json({ error: "Failed to fetch messages" }, 500);
  }

  const messages = await res.json();
  return c.json(messages);
});

// POST /reply - Send reply via Line Messaging API
app.post("/reply", async (c) => {
  const accessToken = c.env.LINE_CHANNEL_ACCESS_TOKEN as string;
  const supabaseUrl = c.env.SUPABASE_URL as string;
  const supabaseAnonKey = c.env.SUPABASE_ANON_KEY as string;
  const supabaseServiceKey = c.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);

  const { error: authError } = await fetch(
    `${supabaseUrl}/auth/v1/user`,
    { headers: { Authorization: `Bearer ${token}` } }
  ).then((r) => r.json());

  if (authError) {
    return c.json({ error: "Invalid token" }, 401);
  }

  let body: { line_user_id: string; content: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const { line_user_id, content } = body;
  if (!line_user_id || !content) {
    return c.json({ error: "line_user_id and content required" }, 400);
  }

  const client = new Client({
    channelAccessToken: accessToken,
    channelSecret: c.env.LINE_CHANNEL_SECRET as string,
  });

  try {
    await client.pushMessage(line_user_id, { type: "text", text: content });
  } catch (err) {
    console.error("Line API error:", err);
    return c.json({ error: "Failed to send message" }, 500);
  }

  // Store admin message in Supabase
  const supabase = getSupabaseClient(supabaseUrl, supabaseServiceKey);
  const now = new Date().toISOString();
  await supabase.upsertLineUser({
    line_user_id,
    last_active: now,
  });
  await supabase.insertMessage({
    line_user_id,
    sender_type: "admin",
    content,
  });

  return c.json({ ok: true });
});

export default app;
