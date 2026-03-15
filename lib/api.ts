/**
 * API client for LineUnifiedInbox Worker
 * Set NEXT_PUBLIC_WORKER_URL in .env.local (e.g. https://your-worker.workers.dev) for production.
 */

const WORKER_URL =
  process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787";

async function getAuthHeaders(): Promise<HeadersInit> {
  const { supabase } = await import("./supabase");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

async function fetchWithAuth(
  url: string,
  opts: RequestInit = {}
): Promise<Response> {
  let headers = await getAuthHeaders();
  let res = await fetch(url, { ...opts, headers: { ...headers, ...opts.headers } });
  if (res.status === 401) {
    const { supabase } = await import("./supabase");
    await supabase.auth.refreshSession();
    headers = await getAuthHeaders();
    res = await fetch(url, { ...opts, headers: { ...headers, ...opts.headers } });
  }
  return res;
}

/** โหลด channels จาก Supabase โดยตรง (fallback เมื่อ Worker ล้มเหลว เช่น 1042) */
export async function fetchChannelsFromSupabase(): Promise<Array<{ id: string; name: string; bot_user_id: string }>> {
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase
    .from("channels")
    .select("id,name,bot_user_id")
    .order("name");
  if (error) {
    console.error("[api] fetchChannelsFromSupabase failed", error);
    throw new Error(error.message || "Failed to fetch channels");
  }
  return Array.isArray(data) ? data : [];
}

export async function fetchChannels(options?: { nocache?: boolean }) {
  const headers = await getAuthHeaders();
  const url = options?.nocache ? `${WORKER_URL}/channels?nocache=1` : `${WORKER_URL}/channels`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const errText = await res.text();
    console.error("[api] fetchChannels failed", res.status, errText);
    throw new Error("Failed to fetch channels");
  }
  return res.json();
}

/** ล้าง cache channels หลังเพิ่ม/แก้ไข/ลบ channel ใน Settings */
export async function invalidateChannelsCache() {
  const res = await fetchWithAuth(`${WORKER_URL}/cache/invalidate`, {
    method: "POST",
    body: JSON.stringify({ key: "channels_list" }),
  });
  if (!res.ok) return; // ไม่ต้อง throw - cache ไม่มีก็ยังทำงานได้
}

/** โหลดรายการแชทจาก Supabase โดยตรง (fallback เมื่อ Worker ล้มเหลว) */
export async function fetchChatsFromSupabase(
  channelId: string,
  _options?: { assignedToMe?: boolean; unreadOnly?: boolean }
): Promise<Array<{
  id: string;
  line_user_id: string;
  profile_name: string | null;
  avatar: string | null;
  last_active: string;
  channel_id?: string;
  tags?: string[] | null;
  assigned_admin_id?: string | null;
  assigned_admin_display_name?: string | null;
  last_message?: { content: string; timestamp: string; sender_type: string } | null;
}>> {
  const { supabase } = await import("./supabase");
  const { data: rows, error } = await supabase
    .from("line_users")
    .select("id,line_user_id,profile_name,avatar,last_active,channel_id,assigned_admin_id,tags,last_message_content,last_message_timestamp,last_message_sender_type")
    .eq("channel_id", channelId)
    .order("last_active", { ascending: false });
  if (error) {
    console.error("[api] fetchChatsFromSupabase failed", error);
    throw new Error(error.message || "Failed to fetch chats");
  }
  const list = Array.isArray(rows) ? rows : [];
  const adminIds = Array.from(new Set(list.map((r: { assigned_admin_id?: string | null }) => r.assigned_admin_id).filter(Boolean))) as string[];
  let displayNames: Record<string, string> = {};
  if (adminIds.length > 0) {
    const { data: profiles } = await supabase.from("admin_profiles").select("user_id,display_name").in("user_id", adminIds);
    if (Array.isArray(profiles)) {
      profiles.forEach((p: { user_id: string; display_name: string | null }) => {
        displayNames[p.user_id] = p.display_name ?? "";
      });
    }
  }
  return list.map((u: {
    id: string;
    line_user_id: string;
    profile_name: string | null;
    avatar: string | null;
    last_active: string;
    channel_id?: string;
    assigned_admin_id?: string | null;
    tags?: string[] | null;
    last_message_content?: string | null;
    last_message_timestamp?: string | null;
    last_message_sender_type?: string | null;
  }) => ({
    id: u.id,
    line_user_id: u.line_user_id,
    profile_name: u.profile_name,
    avatar: u.avatar,
    last_active: u.last_active,
    channel_id: u.channel_id,
    tags: u.tags ?? null,
    assigned_admin_id: u.assigned_admin_id ?? null,
    assigned_admin_display_name: u.assigned_admin_id ? (displayNames[u.assigned_admin_id] || null) : null,
    last_message:
      u.last_message_content != null
        ? { content: u.last_message_content, timestamp: u.last_message_timestamp ?? "", sender_type: u.last_message_sender_type ?? "user" }
        : null,
  }));
}

export type ChatFilterMode = "all" | "unread" | "in_progress" | "resolved";

export async function fetchChats(channelId: string, options?: { assignedToMe?: boolean; unreadOnly?: boolean; status?: ChatFilterMode; nocache?: boolean }) {
  const headers = await getAuthHeaders();
  let url = `${WORKER_URL}/chats?channel_id=${encodeURIComponent(channelId)}`;
  if (options?.status && options.status !== "all") {
    if (options.status === "unread") url += "&unread_only=1";
    else if (options.status === "in_progress") url += "&status=in_progress";
    else if (options.status === "resolved") url += "&status=resolved";
  } else {
    if (options?.assignedToMe) url += "&assigned_to=me";
    if (options?.unreadOnly) url += "&unread_only=1";
  }
  if (options?.nocache) url += "&nocache=1";
  const res = await fetch(url, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    try {
      return await fetchChatsFromSupabase(channelId, options);
    } catch (fallbackErr) {
      const msg = (data && typeof data === "object" && typeof (data as { error?: string }).error === "string")
        ? (data as { error: string }).error
        : "Failed to fetch chats";
      console.error("[api] fetchChats failed", res.status, data);
      throw new Error(msg);
    }
  }
  if (data && typeof data === "object" && "error" in data && Array.isArray((data as { chats?: unknown[] }).chats)) {
    return (data as { chats: unknown[] }).chats;
  }
  return Array.isArray(data) ? data : [];
}

/** Batch multiple operations into one request */
export async function fetchBatch(operations: Array<
  | { method: "get_channels"; nocache?: boolean }
  | { method: "get_chats"; channel_id: string; assigned_to?: string; unread_only?: "1"; status?: string; nocache?: boolean }
>) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${WORKER_URL}/batch`, {
    method: "POST",
    headers,
    body: JSON.stringify({ operations }),
  });
  if (!res.ok) throw new Error("Failed to fetch batch");
  const data = await res.json();
  return data.results as unknown[];
}

export async function fetchQueue(): Promise<Array<{ id: string; line_user_id: string; profile_name: string | null; channel_id: string; channel_name: string; last_active: string; tags: string[] | null; last_message: { content: string; timestamp: string } | null }>> {
  const res = await fetchWithAuth(`${WORKER_URL}/queue`);
  if (!res.ok) return [];
  return res.json();
}

export async function fetchMessages(channelId: string, userId: string) {
  const headers = await getAuthHeaders();
  const res = await fetch(
    `${WORKER_URL}/messages/${encodeURIComponent(userId)}?channel_id=${encodeURIComponent(channelId)}`,
    { headers }
  );
  if (!res.ok) throw new Error("Failed to fetch messages");
  return res.json();
}

/** อัปโหลดรูปเพื่อส่งให้ลูกค้า - คืนค่า URL สำหรับใช้กับ sendReply */
export async function uploadImage(channelId: string, file: File): Promise<string> {
  const { supabase } = await import("./supabase");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  const formData = new FormData();
  formData.append("file", file);
  formData.append("channel_id", channelId);

  const res = await fetch(`${WORKER_URL}/upload-image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to upload image");
  }
  const data = await res.json();
  return data.url;
}

export async function sendReply(
  channelId: string,
  lineUserId: string,
  content: string,
  imageUrl?: string
) {
  const headers = await getAuthHeaders();
  const body: { channel_id: string; line_user_id: string; content?: string; image_url?: string } = {
    channel_id: channelId,
    line_user_id: lineUserId,
  };
  if (content) body.content = content;
  if (imageUrl) body.image_url = imageUrl;
  const res = await fetch(`${WORKER_URL}/reply`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to send reply");
  return res.json();
}

// Admin user management (super_admin only)
export interface AdminUser {
  id: string;
  email: string;
  role: string;
  display_name?: string | null;
  created_at?: string;
  last_sign_in_at?: string;
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const res = await fetchWithAuth(`${WORKER_URL}/admin/users`);
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

/** รายชื่อเพื่อน admin/super_admin สำหรับส่งแชท (admin+ ใช้ได้, ?online=1 = เฉพาะออนไลน์) */
export async function fetchColleagues(onlineOnly = true): Promise<{ id: string; email: string; display_name?: string | null }[]> {
  const url = `${WORKER_URL}/admin/colleagues${onlineOnly ? "?online=1" : ""}`;
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error("Failed to fetch colleagues");
  return res.json();
}

export type AdminMetrics = Record<
  string,
  { resolved_chats: number; avg_response_time_seconds: number }
>;

export async function fetchAdminMetrics(): Promise<AdminMetrics> {
  const res = await fetchWithAuth(`${WORKER_URL}/admin/metrics`);
  if (!res.ok) throw new Error("Failed to fetch metrics");
  return res.json();
}

export async function createAdminUser(
  email: string,
  password: string,
  role: string
) {
  const res = await fetchWithAuth(`${WORKER_URL}/admin/users`, {
    method: "POST",
    body: JSON.stringify({ email, password, role }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create user");
  }
  return res.json();
}

export async function updateAdminUserRole(uid: string, role: string) {
  const res = await fetchWithAuth(`${WORKER_URL}/admin/users/${uid}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail?.message || "Failed to update role");
  }
  return res.json();
}

export async function updateAdminUserPassword(uid: string, password: string) {
  const res = await fetchWithAuth(`${WORKER_URL}/admin/users/${uid}/password`, {
    method: "PATCH",
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to update password");
  }
  return res.json();
}

/** ดึง Bot User ID จาก LINE API (ใช้เมื่อ Add Channel - ใส่แค่ Channel ID + Access Token) */
export async function fetchLineBotUserId(accessToken: string): Promise<string> {
  const res = await fetchWithAuth(`${WORKER_URL}/line/bot-info`, {
    method: "POST",
    body: JSON.stringify({ access_token: accessToken }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || err.error || "Failed to get Bot User ID from LINE");
  }
  const data = await res.json();
  return data.userId;
}

export async function bulkAssignQueue(
  items: Array<{ channel_id: string; line_user_id: string }>
) {
  const res = await fetchWithAuth(`${WORKER_URL}/queue/assign`, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to assign");
  }
  return res.json();
}

export async function deleteAdminUser(uid: string) {
  const res = await fetchWithAuth(`${WORKER_URL}/admin/users/${uid}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to delete user");
  }
  return res.json();
}
