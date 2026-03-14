/**
 * API client for LineUnifiedInbox Worker
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

export async function fetchChannels() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${WORKER_URL}/channels`, { headers });
  if (!res.ok) throw new Error("Failed to fetch channels");
  return res.json();
}

export async function fetchChats(channelId: string) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${WORKER_URL}/chats?channel_id=${encodeURIComponent(channelId)}`, {
    headers,
  });
  if (!res.ok) throw new Error("Failed to fetch chats");
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

export async function sendReply(
  channelId: string,
  lineUserId: string,
  content: string
) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${WORKER_URL}/reply`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      channel_id: channelId,
      line_user_id: lineUserId,
      content,
    }),
  });
  if (!res.ok) throw new Error("Failed to send reply");
  return res.json();
}

// Admin user management (super_admin only)
export interface AdminUser {
  id: string;
  email: string;
  role: string;
  created_at?: string;
  last_sign_in_at?: string;
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const res = await fetchWithAuth(`${WORKER_URL}/admin/users`);
  if (!res.ok) throw new Error("Failed to fetch users");
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
  if (!res.ok) throw new Error("Failed to update role");
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
