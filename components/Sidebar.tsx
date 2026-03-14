"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ChatUser, Channel } from "@/app/(app)/dashboard/page";

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787";

interface SidebarProps {
  selectedUserId: string | null;
  selectedChannelId: string | null;
  channels: Channel[];
  onSelectChannel: (channelId: string) => void;
  onSelectUser: (userId: string | null) => void;
  token: string;
  channelError?: string | null;
}

export function Sidebar({
  selectedUserId,
  selectedChannelId,
  channels,
  onSelectChannel,
  onSelectUser,
  token,
  channelError,
}: SidebarProps) {
  const [chats, setChats] = useState<ChatUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchChats = async () => {
    if (!selectedChannelId) {
      setChats([]);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(
        `${WORKER_URL}/chats?channel_id=${encodeURIComponent(selectedChannelId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setChats(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchChats();
    const interval = setInterval(fetchChats, 15000);
    return () => clearInterval(interval);
  }, [selectedChannelId, token]);

  useEffect(() => {
    if (!selectedChannelId) return;
    const channel = supabase
      .channel(`sidebar-messages-${selectedChannelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${selectedChannelId}`,
        },
        () => fetchChats()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedChannelId, token]);

  return (
    <aside className="flex w-80 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-200 p-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Chats</h2>
          <p className="text-xs text-gray-500">Line users</p>
        </div>
        {channels.length > 0 && (
          <select
            value={selectedChannelId || ""}
            onChange={(e) => onSelectChannel(e.target.value)}
            className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#06C755] focus:outline-none focus:ring-2 focus:ring-[#06C755]/20"
          >
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {channelError ? (
          <div className="space-y-2 p-4">
            <p className="text-center text-sm font-medium text-amber-600">
              ไม่สามารถโหลด channels ได้
            </p>
            <p className="text-center text-xs text-gray-500 break-all">
              {channelError}
            </p>
            <p className="text-center text-xs text-gray-500">
              ตรวจสอบ: Worker มี SUPABASE_URL, รัน migrations ใน Supabase, User มี role ใน user_roles
            </p>
          </div>
        ) : !selectedChannelId ? (
          <div className="p-4 text-center text-gray-500">
            No channel selected. Add one in Settings.
          </div>
        ) : loading ? (
          <div className="p-4 text-center text-gray-500">Loading...</div>
        ) : error ? (
          <div className="p-4 text-center text-red-600">{error}</div>
        ) : chats.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            No conversations yet. Messages from Line will appear here.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {chats.map((chat) => (
              <li key={`${chat.channel_id}-${chat.line_user_id}`}>
                <button
                  onClick={() => onSelectUser(chat.line_user_id)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                    selectedUserId === chat.line_user_id
                      ? "bg-[#06C755] text-white"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
                    selectedUserId === chat.line_user_id ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"
                  }`}>
                    {chat.profile_name?.[0]?.toUpperCase() || chat.line_user_id.slice(-2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {chat.profile_name || `User ${chat.line_user_id.slice(-6)}`}
                    </p>
                    <p className={`truncate text-xs ${selectedUserId === chat.line_user_id ? "text-white/80" : "text-gray-500"}`}>
                      {chat.last_message?.content || "No messages"}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
