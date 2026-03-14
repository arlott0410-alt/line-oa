/**
 * LineUnifiedInbox - Cloudflare Worker
 * Multi-channel: webhook routes by destination (bot_user_id), credentials from DB
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../env";
import { cors } from "hono/cors";
import { compressImage } from "./compress-photon";

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

async function getChannelByDestination(
  baseUrl: string,
  serviceKey: string,
  destination: string
): Promise<{ id: string; secret: string; access_token: string } | null> {
  // ลอง bot_user_id ก่อน
  let res = await supabaseFetch(baseUrl, serviceKey, "/channels", {
    params: `bot_user_id=eq.${encodeURIComponent(destination)}&select=id,secret,access_token`,
  });
  if (res.ok) {
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) return data[0];
  }
  // fallback: ลอง line_channel_id (Channel ID จาก Basic settings)
  res = await supabaseFetch(baseUrl, serviceKey, "/channels", {
    params: `line_channel_id=eq.${encodeURIComponent(destination)}&select=id,secret,access_token`,
  });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

// Auto-tag based on message content (simple regex)
function autoTagFromContent(content: string): string[] {
  const lower = content.toLowerCase();
  const tags: string[] = [];
  if (/\b(ฝาก|deposit)\b/.test(lower)) tags.push("deposit");
  else if (/\b(ถอน|withdrawal)\b/.test(lower)) tags.push("withdrawal");
  else tags.push("general");
  return tags;
}

// Round-robin assign: pick available admin (role=admin/super_admin, status=available or unset)
// Prefer skills match; order by last_assign_time ASC
async function assignChatToAdmin(
  baseUrl: string,
  serviceKey: string,
  lineUserId: string,
  channelId: string,
  tags: string[]
): Promise<void> {
  // Get admin/super_admin user_ids
  const rolesRes = await fetch(
    `${baseUrl}/rest/v1/user_roles?role=in.(admin,super_admin)&select=user_id`,
    {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    }
  );
  if (!rolesRes.ok) return;
  const roles = await rolesRes.json();
  const adminUserIds = Array.isArray(roles) ? roles.map((r: { user_id: string }) => r.user_id) : [];
  if (adminUserIds.length === 0) return;

  // Get admin_status: available or not present (treat as available)
  const idsForFilter = adminUserIds.map((id) => `"${id}"`).join(",");
  const statusRes = await fetch(
    `${baseUrl}/rest/v1/admin_status?user_id=in.(${idsForFilter})&select=user_id,last_assign_time,status`,
    {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    }
  );
  const statusList = statusRes.ok ? await statusRes.json() : [];
  const availableIds = adminUserIds.filter((id) => {
    const s = (statusList as { user_id: string; status?: string }[]).find((x) => x.user_id === id);
    return !s || s.status === "available";
  });
  if (availableIds.length === 0) return;

  // Get skills
  const availIdsForFilter = availableIds.map((id) => `"${id}"`).join(",");
  const skillsRes = await fetch(
    `${baseUrl}/rest/v1/admin_skills?user_id=in.(${availIdsForFilter})&select=user_id,skill`,
    {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    }
  );
  const skillsList = skillsRes.ok ? await skillsRes.json() : [];
  const skillsMap = new Map<string, string[]>();
  for (const s of skillsList as { user_id: string; skill: string }[]) {
    if (!skillsMap.has(s.user_id)) skillsMap.set(s.user_id, []);
    skillsMap.get(s.user_id)!.push(s.skill);
  }

  const tag = tags[0] || "general";
  const withSkill = availableIds.filter((id) => {
    const s = skillsMap.get(id) || [];
    return s.includes(tag) || s.includes("general");
  });
  const candidates = withSkill.length > 0 ? withSkill : availableIds;

  // Round-robin by last_assign_time
  const withTime = candidates.map((id) => {
    const a = (statusList as { user_id: string; last_assign_time?: string }[]).find((x) => x.user_id === id);
    return { id, last: a?.last_assign_time || null };
  });
  withTime.sort((a, b) => {
    if (!a.last) return -1;
    if (!b.last) return 1;
    return new Date(a.last).getTime() - new Date(b.last).getTime();
  });
  const assignTo = withTime[0]?.id;
  if (!assignTo) return;

  const now = new Date().toISOString();
  await fetch(
    `${baseUrl}/rest/v1/line_users?channel_id=eq.${channelId}&line_user_id=eq.${encodeURIComponent(lineUserId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        assigned_admin_id: assignTo,
        queue_status: "assigned",
        tags,
      }),
    }
  );
  await fetch(`${baseUrl}/rest/v1/admin_status?user_id=eq.${assignTo}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ last_assign_time: now, last_updated: now }),
  });
}

// ตรวจสอบ super_admin โดยใช้ service_role (bypass RLS) — ทำงานได้แน่นอน
async function requireSuperAdmin(
  supabaseUrl: string,
  serviceKey: string,
  token: string
): Promise<{ ok: true } | { ok: false; status: number; body: object }> {
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${token}`,
    },
  });
  const userData = await userRes.json();
  const userId = userData.user?.id ?? userData.id;
  if (userData.error || !userId) {
    return { ok: false, status: 401, body: { error: "Invalid token" } };
  }
  // ใช้ service_role อ่าน user_roles — ไม่ติด RLS
  const rolesRes = await fetch(
    `${supabaseUrl}/rest/v1/user_roles?user_id=eq.${userId}&select=role`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
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

// GET /r2/* - Serve images from R2 (เมื่อ R2_PUBLIC_BASE_URL ไม่ได้ตั้งค่า)
app.get("/r2/*", async (c) => {
  const bucket = c.env.IMAGES_BUCKET as R2Bucket | undefined;
  if (!bucket) return c.json({ error: "R2 not configured" }, 503);
  const path = c.req.path.replace(/^\/r2\//, "");
  if (!path) return c.notFound();
  try {
    const obj = await bucket.get(path);
    if (!obj) return c.notFound();
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set("Cache-Control", "public, max-age=86400");
    return new Response(obj.body, { headers, status: 200 });
  } catch {
    return c.notFound();
  }
});

// GET /webhook - LINE may use for URL verification; return 200
app.get("/webhook", (c) => c.json({ ok: true }));

// GET /health และ GET /webhook/health - ตรวจสอบว่า Worker ทำงานและเชื่อมต่อ Supabase ได้
async function healthHandler(c: Context<{ Bindings: Env }>) {
  const supabaseUrl = c.env.SUPABASE_URL as string;
  const supabaseServiceKey = c.env.SUPABASE_SERVICE_ROLE_KEY as string;
  if (!supabaseUrl || !supabaseServiceKey) {
    return c.json({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/channels?select=name,bot_user_id&order=name.asc`, {
      headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
    });
    const ok = res.ok;
    const channels = ok ? await res.json() : [];
    const list = Array.isArray(channels) ? channels : [];
    return c.json({
      ok: true,
      supabase: ok ? "connected" : "error",
      channels: list.map((ch: { name: string; bot_user_id: string }) => ({
        name: ch.name,
        channel_id: ch.bot_user_id,
      })),
      hint: "destination ที่ LINE ส่ง ต้องตรงกับ channel_id - กด Verify ใน LINE Console แล้วดู Logs ใน Cloudflare Workers",
    });
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 500);
  }
}
app.get("/health", healthHandler);
app.get("/webhook/health", healthHandler);

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

  const botUserId = body.destination != null ? String(body.destination) : "";
  if (!botUserId || !body.events?.length) {
    if (botUserId) console.log("[webhook] Verify/test request, destination:", botUserId);
    return c.json({ ok: true });
  }

  const channel = await getChannelByDestination(supabaseUrl, supabaseServiceKey, botUserId);
  if (!channel?.secret) {
    console.error("[webhook] Channel not found for destination:", botUserId, "- ตรวจสอบว่า Channel ID ใน Settings ตรงกับ destination ที่ LINE ส่ง");
    return c.json({ ok: true }); // Unknown channel, accept to avoid retries
  }

  const isValid = await verifyLineSignature(rawBody, signature, channel.secret);
  if (!isValid) {
    console.error("[webhook] Invalid signature for channel:", channel.id, "- ตรวจสอบ Channel Secret ใน Settings");
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

    // Get content early for auto-tag (text only)
    let content: string;
    let imageOriginalUrl: string | null = null;
    let imagePreviewUrl: string | null = null;
    let mimeType: string | null = null;

    if (event.message.type === "text") {
      content = event.message.text || "";
    } else if (event.message.type === "image") {
      content = "[Image]";
      if (imagesBucket) {
        try {
          const imgRes = await fetch(
            `https://api-data.line.me/v2/bot/message/${messageId}/content`,
            { headers: { Authorization: `Bearer ${channel.access_token}` } }
          );
          if (!imgRes.ok) throw new Error("Failed to fetch image");

          const arrayBuffer = await imgRes.arrayBuffer();
          const inputBytes = new Uint8Array(arrayBuffer);
          const contentType = imgRes.headers.get("Content-Type") || "image/jpeg";
          mimeType = contentType.split(";")[0].trim();

          const compressed = compressImage(inputBytes, mimeType);
          let finalBytes: Uint8Array;
          let finalContentType: string;
          let ext: string;

          if (compressed) {
            finalBytes = compressed.bytes;
            finalContentType = compressed.contentType;
            ext = compressed.ext;
          } else {
            finalBytes = inputBytes;
            finalContentType = mimeType;
            ext = mimeType === "image/png" ? "png" : mimeType === "image/gif" ? "gif" : "jpg";
          }

          const timestamp = Math.floor(Date.now() / 1000);
          const key = `${channelId}/${userId}/${timestamp}-${messageId}.${ext}`;

          await imagesBucket.put(key, finalBytes, {
            httpMetadata: { contentType: finalContentType },
          });

          if (r2PublicBase) {
            const baseUrl = r2PublicBase.replace(/\/$/, "");
            imageOriginalUrl = `${baseUrl}/${key}`;
            imagePreviewUrl = imageOriginalUrl;
          } else {
            const workerOrigin = new URL(c.req.url).origin;
            imageOriginalUrl = `${workerOrigin}/r2/${key}`;
            imagePreviewUrl = imageOriginalUrl;
          }
        } catch (err) {
          console.error("Image upload failed:", err);
        }
      }
    } else {
      continue;
    }

    // Upsert line_user: PATCH if exists, else INSERT (with auto-tag + assign for new)
    const checkRes = await fetch(
      `${supabaseUrl}/rest/v1/line_users?channel_id=eq.${channelId}&line_user_id=eq.${encodeURIComponent(userId)}&select=id,queue_status,profile_name`,
      {
        headers: {
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
      }
    );
    const existing = await checkRes.json();
    const isNewChat = !Array.isArray(existing) || existing.length === 0;
    const existingProfile = Array.isArray(existing) && existing.length > 0 ? existing[0] : null;

    // ดึง profile จาก LINE เฉพาะเมื่อยังไม่มี (ลดการเรียก LINE API)
    let profileName: string | null = null;
    let avatarUrl: string | null = null;
    if (!existingProfile?.profile_name) {
      try {
        const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
          headers: { Authorization: `Bearer ${channel.access_token}` },
        });
        if (profileRes.ok) {
          const profile = (await profileRes.json()) as { displayName?: string; pictureUrl?: string };
          profileName = profile.displayName || null;
          avatarUrl = profile.pictureUrl || null;
        }
      } catch {
        /* ignore */
      }
    }

    if (isNewChat) {
      const tags = autoTagFromContent(content);
      const lineUserBody: Record<string, unknown> = {
        channel_id: channelId,
        line_user_id: userId,
        last_active: now,
        tags,
        queue_status: "unassigned",
      };
      if (profileName) lineUserBody.profile_name = profileName;
      if (avatarUrl) lineUserBody.avatar = avatarUrl;
      await fetch(`${supabaseUrl}/rest/v1/line_users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify(lineUserBody),
      });
      await assignChatToAdmin(supabaseUrl, supabaseServiceKey, userId, channelId, tags);
    } else {
      const patchBody: Record<string, string> = { last_active: now };
      if (profileName) patchBody.profile_name = profileName;
      if (avatarUrl) patchBody.avatar = avatarUrl;
      await fetch(
        `${supabaseUrl}/rest/v1/line_users?channel_id=eq.${channelId}&line_user_id=eq.${encodeURIComponent(userId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseServiceKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify(patchBody),
        }
      );
    }

    // Insert message (use event timestamp for ordering)
    const eventTs = event.timestamp ? new Date(event.timestamp).toISOString() : now;
    const messageBody: Record<string, unknown> = {
      channel_id: channelId,
      line_user_id: userId,
      sender_type: "user",
      content,
      message_id: messageId,
      timestamp: eventTs,
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

// POST /line/bot-info - ดึง Bot User ID จาก LINE API (super_admin only, ใช้เมื่อ Add Channel)
app.post("/line/bot-info", async (c) => {
  const supabaseUrl = c.env.SUPABASE_URL as string;
  const supabaseServiceKey = c.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
  const token = authHeader.slice(7);
  const authCheck = await requireSuperAdmin(supabaseUrl, supabaseServiceKey, token);
  if (!authCheck.ok) return c.json(authCheck.body, authCheck.status);

  let body: { access_token: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const { access_token } = body;
  if (!access_token) return c.json({ error: "access_token required" }, 400);

  const lineRes = await fetch("https://api.line.me/v2/bot/info", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!lineRes.ok) {
    const err = await lineRes.text();
    return c.json({ error: "LINE API error", detail: err.slice(0, 200) }, 400);
  }
  const data = (await lineRes.json()) as { userId?: string };
  if (!data.userId) return c.json({ error: "No userId in LINE response" }, 400);
  return c.json({ userId: data.userId });
});

// GET /channels - List channels (auth required)
app.get("/channels", async (c) => {
  const supabaseUrl = c.env.SUPABASE_URL as string;
  const supabaseAnonKey = c.env.SUPABASE_ANON_KEY as string;
  const authHeader = c.req.header("Authorization");

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("channels: Missing SUPABASE_URL or SUPABASE_ANON_KEY");
    return c.json({ error: "Server config error" }, 500);
  }

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const authData = await authRes.json();
  if (authData.error) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/channels?select=id,name,bot_user_id&order=name.asc`,
    {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error("channels: Supabase REST error", res.status, errText);
    return c.json(
      { error: "Failed to fetch channels", detail: errText.slice(0, 200) },
      500
    );
  }
  const data = await res.json();
  return c.json(data);
});

// GET /chats?channel_id=xxx&assigned_to=me
app.get("/chats", async (c) => {
  const channelId = c.req.query("channel_id");
  const assignedToMe = c.req.query("assigned_to") === "me";
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
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
  });
  const userData = await userRes.json();
  const userId = userData.user?.id ?? userData.id;
  if (userData.error || !userId) return c.json({ error: "Invalid token" }, 401);

  let url = `${supabaseUrl}/rest/v1/line_users?channel_id=eq.${channelId}&order=last_active.desc&select=id,line_user_id,profile_name,avatar,last_active,channel_id,assigned_admin_id,tags,last_message_content,last_message_timestamp,last_message_sender_type`;
  if (assignedToMe) url += `&assigned_admin_id=eq.${userId}`;

  const res = await fetch(url, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) return c.json({ error: "Failed to fetch chats" }, 500);
  const users = await res.json();

  const usersWithLastMessage = (Array.isArray(users) ? users : []).map(
    (u: {
      line_user_id: string;
      last_message_content?: string;
      last_message_timestamp?: string;
      last_message_sender_type?: string;
    }) => ({
      ...u,
      last_message:
        u.last_message_content != null
          ? {
              content: u.last_message_content,
              timestamp: u.last_message_timestamp,
              sender_type: u.last_message_sender_type || "user",
            }
          : null,
    })
  );

  return c.json(usersWithLastMessage);
});

// GET /queue - Unassigned chats (admin+ only)
app.get("/queue", async (c) => {
  const supabaseUrl = c.env.SUPABASE_URL as string;
  const supabaseAnonKey = c.env.SUPABASE_ANON_KEY as string;
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);

  const token = authHeader.slice(7);
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
  });
  const userData = await userRes.json();
  const userId = userData.user?.id ?? userData.id;
  if (userData.error || !userId) return c.json({ error: "Invalid token" }, 401);

  const rolesRes = await fetch(
    `${supabaseUrl}/rest/v1/user_roles?user_id=eq.${userId}&select=role`,
    {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
    }
  );
  const roles = await rolesRes.json();
  const role = Array.isArray(roles) && roles.length > 0 ? roles[0]?.role : null;
  if (!["super_admin", "admin"].includes(role)) return c.json({ error: "Admin required" }, 403);

  const res = await fetch(
    `${supabaseUrl}/rest/v1/line_users?queue_status=eq.unassigned&select=id,line_user_id,profile_name,channel_id,last_active,tags,vip_level,last_message_content,last_message_timestamp`,
    {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) return c.json({ error: "Failed to fetch queue" }, 500);
  let items = await res.json();
  items = Array.isArray(items) ? items : [];
  items.sort((a: { vip_level?: number; last_active?: string }, b: { vip_level?: number; last_active?: string }) => {
    const va = a.vip_level ?? 0;
    const vb = b.vip_level ?? 0;
    if (vb !== va) return vb - va;
    const ta = a.last_active ? new Date(a.last_active).getTime() : 0;
    const tb = b.last_active ? new Date(b.last_active).getTime() : 0;
    return ta - tb;
  });

  const channelsRes = await fetch(
    `${supabaseUrl}/rest/v1/channels?select=id,name`,
    {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
    }
  );
  const channels = channelsRes.ok ? await channelsRes.json() : [];
  const channelMap = new Map((channels as { id: string; name: string }[]).map((ch) => [ch.id, ch.name]));

  const withChannelAndMessage = (Array.isArray(items) ? items : []).map(
    (u: {
      id: string;
      line_user_id: string;
      channel_id: string;
      last_message_content?: string;
      last_message_timestamp?: string;
    }) => ({
      ...u,
      channel_name: channelMap.get(u.channel_id) || "—",
      last_message:
        u.last_message_content != null
          ? { content: u.last_message_content, timestamp: u.last_message_timestamp }
          : null,
    })
  );

  return c.json(withChannelAndMessage);
});

// POST /queue/assign - Bulk assign chats to current admin
app.post("/queue/assign", async (c) => {
  const supabaseUrl = c.env.SUPABASE_URL as string;
  const supabaseServiceKey = c.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabaseAnonKey = c.env.SUPABASE_ANON_KEY as string;
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
  const token = authHeader.slice(7);
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
  });
  const userData = await userRes.json();
  const userId = userData.user?.id ?? userData.id;
  if (userData.error || !userId) return c.json({ error: "Invalid token" }, 401);
  const rolesRes = await fetch(
    `${supabaseUrl}/rest/v1/user_roles?user_id=eq.${userId}&select=role`,
    { headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` } }
  );
  const roles = await rolesRes.json();
  const role = Array.isArray(roles) && roles.length > 0 ? roles[0]?.role : null;
  if (!["super_admin", "admin"].includes(role)) return c.json({ error: "Admin required" }, 403);
  let body: { items: Array<{ channel_id: string; line_user_id: string }> };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const items = body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return c.json({ error: "items array required" }, 400);
  }
  for (const it of items) {
    await fetch(
      `${supabaseUrl}/rest/v1/line_users?channel_id=eq.${it.channel_id}&line_user_id=eq.${encodeURIComponent(it.line_user_id)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseServiceKey,
          Authorization: `Bearer ${supabaseServiceKey}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ assigned_admin_id: userId, queue_status: "assigned" }),
      }
    );
  }
  return c.json({ ok: true, count: items.length });
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

// POST /upload-image - อัปโหลดรูปสำหรับส่งให้ลูกค้า (auth required)
app.post("/upload-image", async (c) => {
  const supabaseUrl = c.env.SUPABASE_URL as string;
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
  const token = authHeader.slice(7);
  const { error: authError } = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  if (authError) return c.json({ error: "Invalid token" }, 401);

  const bucket = c.env.IMAGES_BUCKET as R2Bucket | undefined;
  if (!bucket) return c.json({ error: "R2 not configured" }, 503);

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: "Invalid form data" }, 400);
  }
  const file = formData.get("file") as File | null;
  const channelId = formData.get("channel_id") as string | null;
  if (!file || !channelId) return c.json({ error: "file and channel_id required" }, 400);

  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: "Invalid file type. Use JPEG, PNG, GIF or WebP" }, 400);
  }
  if (file.size > 10 * 1024 * 1024) return c.json({ error: "File too large (max 10MB)" }, 400);

  const ext = file.type === "image/png" ? "png" : file.type === "image/gif" ? "gif" : file.type === "image/webp" ? "webp" : "jpg";
  const key = `outbound/${channelId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  try {
    const arrayBuffer = await file.arrayBuffer();
    await bucket.put(key, arrayBuffer, {
      httpMetadata: { contentType: file.type },
    });
  } catch (err) {
    console.error("Image upload failed:", err);
    return c.json({ error: "Upload failed" }, 500);
  }

  const r2PublicBase = c.env.R2_PUBLIC_BASE_URL as string | undefined;
  const url = r2PublicBase
    ? `${r2PublicBase.replace(/\/$/, "")}/${key}`
    : `${new URL(c.req.url).origin}/r2/${key}`;

  return c.json({ url });
});

// POST /reply - Require channel_id, get access_token from DB (รองรับ text และ/หรือ image)
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

  let body: { channel_id: string; line_user_id: string; content?: string; image_url?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const { channel_id, line_user_id, content, image_url } = body;
  if (!channel_id || !line_user_id) {
    return c.json({ error: "channel_id and line_user_id required" }, 400);
  }
  if (!content && !image_url) {
    return c.json({ error: "content or image_url required" }, 400);
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

  const lineMessages: Array<{ type: "text"; text: string } | { type: "image"; originalContentUrl: string; previewImageUrl: string }> = [];
  if (content) lineMessages.push({ type: "text", text: content });
  if (image_url) lineMessages.push({ type: "image", originalContentUrl: image_url, previewImageUrl: image_url });

  const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channel.access_token}`,
    },
    body: JSON.stringify({
      to: line_user_id,
      messages: lineMessages,
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
  const msgContent = content || (image_url ? "[Image]" : "");
  const messageBody: Record<string, unknown> = {
    channel_id,
    line_user_id,
    sender_type: "admin",
    content: msgContent,
  };
  if (image_url) {
    messageBody.image_original_url = image_url;
    messageBody.image_preview_url = image_url;
  }
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
  const authCheck = await requireSuperAdmin(supabaseUrl, supabaseServiceKey, token);
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

// GET /admin/metrics - resolved_chats, avg_response_time per admin (super_admin only)
app.get("/admin/metrics", async (c) => {
  const supabaseUrl = c.env.SUPABASE_URL as string;
  const supabaseServiceKey = c.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return c.json({ error: "Unauthorized" }, 401);
  const token = authHeader.slice(7);
  const authCheck = await requireSuperAdmin(supabaseUrl, supabaseServiceKey, token);
  if (!authCheck.ok) return c.json(authCheck.body, authCheck.status);

  const luRes = await fetch(
    `${supabaseUrl}/rest/v1/line_users?queue_status=eq.resolved&assigned_admin_id=not.is.null&select=assigned_admin_id`,
    {
      headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
    }
  );
  const luData = luRes.ok ? await luRes.json() : [];
  const resolvedByAdmin = new Map<string, number>();
  for (const r of luData as { assigned_admin_id: string }[]) {
    const id = r.assigned_admin_id;
    if (id) resolvedByAdmin.set(id, (resolvedByAdmin.get(id) || 0) + 1);
  }

  const msgRes = await fetch(
    `${supabaseUrl}/rest/v1/messages?select=channel_id,line_user_id,sender_type,timestamp&order=timestamp.asc`,
    {
      headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
    }
  );
  const messages = msgRes.ok ? await msgRes.json() : [];
  const firstUserByChat = new Map<string, number>();
  const firstAdminByChat = new Map<string, number>();
  for (const m of messages as { channel_id: string; line_user_id: string; sender_type: string; timestamp: string }[]) {
    const key = `${m.channel_id}-${m.line_user_id}`;
    const ts = new Date(m.timestamp).getTime();
    if (m.sender_type === "user" && !firstUserByChat.has(key)) firstUserByChat.set(key, ts);
    if (m.sender_type === "admin" && !firstAdminByChat.has(key)) firstAdminByChat.set(key, ts);
  }

  const luAssignRes = await fetch(
    `${supabaseUrl}/rest/v1/line_users?assigned_admin_id=not.is.null&select=channel_id,line_user_id,assigned_admin_id`,
    {
      headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}` },
    }
  );
  const luAssign = luAssignRes.ok ? await luAssignRes.json() : [];
  const responseTimesByAdmin = new Map<string, number[]>();
  for (const r of luAssign as { channel_id: string; line_user_id: string; assigned_admin_id: string }[]) {
    const key = `${r.channel_id}-${r.line_user_id}`;
    const userTs = firstUserByChat.get(key);
    const adminTs = firstAdminByChat.get(key);
    if (userTs != null && adminTs != null && adminTs >= userTs) {
      const diff = (adminTs - userTs) / 1000;
      const arr = responseTimesByAdmin.get(r.assigned_admin_id) || [];
      arr.push(diff);
      responseTimesByAdmin.set(r.assigned_admin_id, arr);
    }
  }

  const metrics: Record<string, { resolved_chats: number; avg_response_time_seconds: number }> = {};
  const allAdminIds = new Set([...resolvedByAdmin.keys(), ...responseTimesByAdmin.keys()]);
  for (const id of allAdminIds) {
    const resolved = resolvedByAdmin.get(id) || 0;
    const times = responseTimesByAdmin.get(id) || [];
    const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    metrics[id] = { resolved_chats: resolved, avg_response_time_seconds: Math.round(avg) };
  }
  return c.json(metrics);
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
  const authCheck = await requireSuperAdmin(supabaseUrl, supabaseServiceKey, token);
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
  const authCheck = await requireSuperAdmin(supabaseUrl, supabaseServiceKey, token);
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
  const authCheck = await requireSuperAdmin(supabaseUrl, supabaseServiceKey, token);
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
