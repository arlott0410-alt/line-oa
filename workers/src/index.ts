/**
 * LineUnifiedInbox - Cloudflare Worker
 * Multi-channel: webhook routes by destination (bot_user_id), credentials from DB
 */

import { Hono } from "hono";
import type { Env } from "../env";
import { cors } from "hono/cors";

// Types
interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  source: { userId?: string; type: string };
  message?: {
    type: string;
    id: string;
    text?: string;
    contentProvider?: { type?: string; originalContentUrl?: string; previewImageUrl?: string; mimeType?: string };
  };
  timestamp: number;
}

interface LineWebhookBody {
  destination?: string; // bot_user_id for routing
  events?: LineWebhookEvent[];
}

// Verify Line webhook signature (HMAC-SHA256)
async function verifyLineSignature(
  body: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature || !body || !secret) return false;
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

// Supabase REST helpers (service role)
function supabaseFetch(
  baseUrl: string,
  serviceKey: string,
  path: string,
  opts: { method?: string; body?: string; params?: string } = {}
) {
  const url = `${baseUrl}/rest/v1${path}${opts.params ? `?${opts.params}` : ""}`;
  return fetch(url, {
    method: opts.method || "GET",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...(opts.method === "UPSERT" && { Prefer: "resolution=merge-duplicates,return=minimal" }),
      ...(opts.method === "POST" && { Prefer: "return=minimal" }),
    },
    body: opts.body,
  });
}

async function getChannelByBotUserId(
  baseUrl: string,
  serviceKey: string,
  botUserId: string
): Promise<{ id: string; secret: string; access_token: string } | null> {
  const res = await supabaseFetch(baseUrl, serviceKey, "/channels", {
    params: `bot_user_id=eq.${encodeURIComponent(botUserId)}&select=id,secret,access_token`,
  });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function requireSuperAdmin(
  supabaseUrl: string,
  anonKey: string,
  token: string
): Promise<{ ok: true } | { ok: false; status: number; body: object }> {
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const userData = await userRes.json();
  const userId = userData.user?.id ?? userData.id;
  if (userData.error || !userId) {
    return { ok: false, status: 401, body: { error: "Invalid token" } };
  }
  const rolesRes = await fetch(
    `${supabaseUrl}/rest/v1/user_roles?user_id=eq.${userId}&select=role`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
    }
  );
  const roles = await rolesRes.json();
  const role = Array.isArray(roles) && roles.length > 0 ? roles[0]?.role : null;
  if (role !== "super_admin") {
    return { ok: false, status: 403, body: { error: "super_admin required" } };
  }
  return { ok: true };
}

const app = new Hono<{ Bindings: Env }>();

// CORS
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
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// POST /webhook - Line webhook (route by destination = bot_user_id)
app.post("/webhook", async (c) => {
  const supabaseUrl = c.env.SUPABASE_URL as string;
  const supabaseServiceKey = c.env.SUPABASE_SERVICE_ROLE_KEY as string;

  if (!supabaseUrl || !supabaseServiceKey) {
    return c.json({ error: "Missing config" }, 500);
  }

  const signature = c.req.header("x-line-signature");
  const rawBody = await c.req.text();

  let body: LineWebhookBody;
  try {
    body = JSON.parse(rawBody || "{}") as LineWebhookBody;
  } catch {
    return c.json({ ok: true }); // Verification or invalid
  }

  const botUserId = body.destination;
  if (!botUserId || !body.events?.length) {
    return c.json({ ok: true });
  }

  const channel = await getChannelByBotUserId(supabaseUrl, supabaseServiceKey, botUserId);
  if (!channel?.secret) {
    return c.json({ ok: true }); // Unknown channel, accept to avoid retries
  }

  const isValid = await verifyLineSignature(rawBody, signature, channel.secret);
  if (!isValid) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const channelId = channel.id;
  const imagesBucket = c.env.IMAGES_BUCKET;
  const r2PublicBase = c.env.R2_PUBLIC_BASE_URL as string | undefined;

  for (const event of body.events) {
    if (event.type !== "message" || !event.message) continue;
    const userId = event.source?.userId;
    if (!userId) continue;

    const messageId = event.message.id;
    const now = new Date().toISOString();

    // Upsert line_user: PATCH if exists, else INSERT
    const checkRes = await fetch(
      `${supabaseUrl}/rest/v1/line_users?channel_id=eq.${channelId}&line_user_id=eq.${encodeURIComponent(userId)}&select=id`,
      {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
      }
    );
    const existing = await checkRes.json();
    if (Array.isArray(existing) && existing.length > 0) {
      await fetch(
        `${supabaseUrl}/rest/v1/line_users?channel_id=eq.${channelId}&line_user_id=eq.${encodeURIComponent(userId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ last_active: now }),
        }
      );
    } else {
      await fetch(`${supabaseUrl}/rest/v1/line_users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          channel_id: channelId,
          line_user_id: userId,
          last_active: now,
        }),
      });
    }

    let content: string;
    let imageOriginalUrl: string | null = null;
    let imagePreviewUrl: string | null = null;
    let mimeType: string | null = null;

    if (event.message.type === "text") {
      content = event.message.text || "";
    } else if (event.message.type === "image") {
      content = "[Image]";
      if (imagesBucket && r2PublicBase) {
        try {
          const imgRes = await fetch(
            `https://api-data.line.me/v2/bot/message/${messageId}/content`,
            { headers: { Authorization: `Bearer ${channel.access_token}` } }
          );
          if (!imgRes.ok) throw new Error("Failed to fetch image");

          const arrayBuffer = await imgRes.arrayBuffer();
          const contentType = imgRes.headers.get("Content-Type") || "image/jpeg";
          mimeType = contentType.split(";")[0].trim();
          const ext = mimeType === "image/png" ? "png" : mimeType === "image/gif" ? "gif" : "jpg";
          const timestamp = Math.floor(Date.now() / 1000);
          const key = `${channelId}/${userId}/${timestamp}-${messageId}.${ext}`;

          await imagesBucket.put(key, arrayBuffer, {
            httpMetadata: { contentType: mimeType },
          });

          const baseUrl = r2PublicBase.replace(/\/$/, "");
          imageOriginalUrl = `${baseUrl}/${key}`;
          imagePreviewUrl = imageOriginalUrl;
        } catch (err) {
          console.error("Image upload failed:", err);
        }
      }
    } else {
      continue;
    }

    // Insert message
    const messageBody: Record<string, unknown> = {
      channel_id: channelId,
      line_user_id: userId,
      sender_type: "user",
      content,
      message_id: messageId,
    };
    if (imageOriginalUrl) messageBody.image_original_url = imageOriginalUrl;
    if (imagePreviewUrl) messageBody.image_preview_url = imagePreviewUrl;
    if (mimeType) messageBody.mime_type = mimeType;

    await fetch(`${supabaseUrl}/rest/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(messageBody),
    });
  }

  return c.json({ ok: true });
});

// GET /channels - List channels (auth required)
app.get("/channels", async (c) => {
  const supabaseUrl = c.env.SUPABASE_URL as string;
  const supabaseAnonKey = c.env.SUPABASE_ANON_KEY as string;
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const { error: authError } = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());

  if (authError) return c.json({ error: "Invalid token" }, 401);

  const res = await fetch(
    `${supabaseUrl}/rest/v1/channels?select=id,name,bot_user_id&order=name.asc`,
    {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) return c.json({ error: "Failed to fetch channels" }, 500);
  const data = await res.json();
  return c.json(data);
});

// GET /chats?channel_id=xxx
app.get("/chats", async (c) => {
  const channelId = c.req.query("channel_id");
  const supabaseUrl = c.env.SUPABASE_URL as string;
  const supabaseAnonKey = c.env.SUPABASE_ANON_KEY as string;
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (!channelId) {
    return c.json({ error: "channel_id required" }, 400);
  }

  const token = authHeader.slice(7);
  const { error: authError } = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());

  if (authError) return c.json({ error: "Invalid token" }, 401);

  const res = await fetch(
    `${supabaseUrl}/rest/v1/line_users?channel_id=eq.${channelId}&order=last_active.desc&select=id,line_user_id,profile_name,avatar,last_active,channel_id`,
    {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) return c.json({ error: "Failed to fetch chats" }, 500);
  const users = await res.json();

  const usersWithLastMessage = await Promise.all(
    users.map(async (u: { line_user_id: string }) => {
      const msgRes = await fetch(
        `${supabaseUrl}/rest/v1/messages?channel_id=eq.${channelId}&line_user_id=eq.${encodeURIComponent(u.line_user_id)}&order=timestamp.desc&limit=1&select=content,timestamp,sender_type`,
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

// GET /messages/:userId?channel_id=xxx&limit=50&offset=0
app.get("/messages/:userId", async (c) => {
  const userId = c.req.param("userId");
  const channelId = c.req.query("channel_id");
  const limit = Math.min(parseInt(c.req.query("limit") || "50", 10) || 50, 100);
  const offset = parseInt(c.req.query("offset") || "0", 10) || 0;
  const supabaseUrl = c.env.SUPABASE_URL as string;
  const supabaseAnonKey = c.env.SUPABASE_ANON_KEY as string;
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (!channelId) {
    return c.json({ error: "channel_id required" }, 400);
  }

  const token = authHeader.slice(7);
  const { error: authError } = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());

  if (authError) return c.json({ error: "Invalid token" }, 401);

  const params = `channel_id=eq.${channelId}&line_user_id=eq.${encodeURIComponent(userId)}&order=timestamp.asc&select=id,line_user_id,sender_type,content,timestamp,channel_id,image_original_url,image_preview_url,mime_type&limit=${limit}&offset=${offset}`;
  const res = await fetch(
    `${supabaseUrl}/rest/v1/messages?${params}`,
    {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) return c.json({ error: "Failed to fetch messages" }, 500);
  const messages = await res.json();
  return c.json(messages);
});

// POST /reply - Require channel_id, get access_token from DB
app.post("/reply", async (c) => {
  const supabaseUrl = c.env.SUPABASE_URL as string;
  const supabaseServiceKey = c.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabaseAnonKey = c.env.SUPABASE_ANON_KEY as string;
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const { error: authError } = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());

  if (authError) return c.json({ error: "Invalid token" }, 401);

  let body: { channel_id: string; line_user_id: string; content: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const { channel_id, line_user_id, content } = body;
  if (!channel_id || !line_user_id || !content) {
    return c.json({ error: "channel_id, line_user_id and content required" }, 400);
  }

  // Get channel access_token
  const chRes = await fetch(
    `${supabaseUrl}/rest/v1/channels?id=eq.${channel_id}&select=access_token,secret`,
    {
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
    }
  );
  if (!chRes.ok) return c.json({ error: "Failed to get channel" }, 500);
  const chData = await chRes.json();
  const channel = Array.isArray(chData) && chData.length > 0 ? chData[0] : null;
  if (!channel?.access_token) {
    return c.json({ error: "Channel not found or missing credentials" }, 400);
  }

  const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channel.access_token}`,
    },
    body: JSON.stringify({
      to: line_user_id,
      messages: [{ type: "text", text: content }],
    }),
  });
  if (!lineRes.ok) {
    const errText = await lineRes.text();
    console.error("Line API error:", errText);
    return c.json({ error: "Failed to send message" }, 500);
  }

  const now = new Date().toISOString();

  // Upsert line_user
  await fetch(`${supabaseUrl}/rest/v1/line_users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      channel_id,
      line_user_id,
      last_active: now,
    }),
  }).catch(() => {});

  // Insert admin message
  await fetch(`${supabaseUrl}/rest/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      channel_id,
      line_user_id,
      sender_type: "admin",
      content,
    }),
  });

  return c.json({ ok: true });
});

// --- Admin routes (super_admin only) ---

// GET /admin/users - List users with roles
app.get("/admin/users", async (c) => {
  const supabaseUrl = c.env.SUPABASE_URL as string;
  const supabaseAnonKey = c.env.SUPABASE_ANON_KEY as string;
  const supabaseServiceKey = c.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.slice(7);
  const authCheck = await requireSuperAdmin(supabaseUrl, supabaseAnonKey, token);
  if (!authCheck.ok) return c.json(authCheck.body, authCheck.status);

  const authRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    headers: {
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
    },
  });
  if (!authRes.ok) {
    const err = await authRes.text();
    return c.json({ error: "Failed to list users" }, 500);
  }
  const authData = await authRes.json();
  const users = authData.users || [];

  const rolesRes = await fetch(
    `${supabaseUrl}/rest/v1/user_roles?select=user_id,role`,
    {
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
    }
  );
  const rolesList = rolesRes.ok ? await rolesRes.json() : [];
  const roleMap = new Map(rolesList.map((r: { user_id: string; role: string }) => [r.user_id, r.role]));

  const result = users.map((u: { id: string; email?: string; created_at?: string; last_sign_in_at?: string }) => ({
    id: u.id,
    email: u.email || "",
    role: roleMap.get(u.id) || "viewer",
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
  }));

  return c.json(result);
});

// POST /admin/users - Create user (super_admin only)
app.post("/admin/users", async (c) => {
  const supabaseUrl = c.env.SUPABASE_URL as string;
  const supabaseAnonKey = c.env.SUPABASE_ANON_KEY as string;
  const supabaseServiceKey = c.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.slice(7);
  const authCheck = await requireSuperAdmin(supabaseUrl, supabaseAnonKey, token);
  if (!authCheck.ok) return c.json(authCheck.body, authCheck.status);

  let body: { email: string; password: string; role: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const { email, password, role } = body;
  if (!email || !password || !role) {
    return c.json({ error: "email, password and role required" }, 400);
  }
  if (!["super_admin", "admin", "viewer"].includes(role)) {
    return c.json({ error: "Invalid role" }, 400);
  }

  const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
    }),
  });
  const createData = await createRes.json();
  if (createData.error) {
    return c.json({ error: createData.msg || createData.error_description || "Failed to create user" }, 400);
  }
  const newUserId = createData.user?.id ?? createData.id;

  await fetch(`${supabaseUrl}/rest/v1/user_roles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ user_id: newUserId, role }),
  });

  return c.json({ id: newUserId, email, role });
});

// PATCH /admin/users/:uid/role - Update role (super_admin only)
app.patch("/admin/users/:uid/role", async (c) => {
  const supabaseUrl = c.env.SUPABASE_URL as string;
  const supabaseAnonKey = c.env.SUPABASE_ANON_KEY as string;
  const uid = c.req.param("uid");
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.slice(7);
  const authCheck = await requireSuperAdmin(supabaseUrl, supabaseAnonKey, token);
  if (!authCheck.ok) return c.json(authCheck.body, authCheck.status);

  let body: { role: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const { role } = body;
  if (!role || !["super_admin", "admin", "viewer"].includes(role)) {
    return c.json({ error: "Invalid role" }, 400);
  }

  const supabaseServiceKey = c.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const res = await fetch(
    `${supabaseUrl}/rest/v1/user_roles?user_id=eq.${uid}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ role }),
    }
  );
  if (!res.ok) return c.json({ error: "Failed to update role" }, 500);
  return c.json({ ok: true });
});

// DELETE /admin/users/:uid - Delete user (super_admin only)
app.delete("/admin/users/:uid", async (c) => {
  const supabaseUrl = c.env.SUPABASE_URL as string;
  const supabaseAnonKey = c.env.SUPABASE_ANON_KEY as string;
  const supabaseServiceKey = c.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const uid = c.req.param("uid");
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.slice(7);
  const authCheck = await requireSuperAdmin(supabaseUrl, supabaseAnonKey, token);
  if (!authCheck.ok) return c.json(authCheck.body, authCheck.status);

  const delRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${uid}`, {
    method: "DELETE",
    headers: {
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
    },
  });
  if (!delRes.ok) {
    const err = await delRes.json();
    return c.json({ error: err.msg || "Failed to delete user" }, 400);
  }
  return c.json({ ok: true });
});

export default app;
