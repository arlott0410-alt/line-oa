/**
 * API client for LineUnifiedInbox Worker
 */

const WORKER_URL =
  process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787";

async function getAuthHeaders(): Promise<HeadersInit> {
  const { supabase } = await import("./supabase");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

export async function fetchChats() {
  const headers = await getAuthHeaders();
  const res = await fetch(`${WORKER_URL}/chats`, { headers });
  if (!res.ok) throw new Error("Failed to fetch chats");
  return res.json();
}

export async function fetchMessages(userId: string) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${WORKER_URL}/messages/${encodeURIComponent(userId)}`, {
    headers,
  });
  if (!res.ok) throw new Error("Failed to fetch messages");
  return res.json();
}

export async function sendReply(lineUserId: string, content: string) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${WORKER_URL}/reply`, {
    method: "POST",
    headers,
    body: JSON.stringify({ line_user_id: lineUserId, content }),
  });
  if (!res.ok) throw new Error("Failed to send reply");
  return res.json();
}
