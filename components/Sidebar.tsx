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
    <aside className="flex w-80 flex-col border-r border-slate-800 bg-slate-900/50">
      <div className="border-b border-slate-800 p-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Chats</h2>
          <p className="text-xs text-slate-400">Line users</p>
        </div>
        {channels.length > 0 && (
          <select
            value={selectedChannelId || ""}
            onChange={(e) => onSelectChannel(e.target.value)}
            className="mt-3 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white"
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
            <p className="text-center text-sm font-medium text-amber-400">
              ไม่สามารถโหลด channels ได้
            </p>
            <p className="text-center text-xs text-slate-500 break-all">
              {channelError}
            </p>
            <p className="text-center text-xs text-slate-500">
              ตรวจสอบ: Worker มี SUPABASE_URL, รัน migrations ใน Supabase, User มี role ใน user_roles
            </p>
          </div>
        ) : !selectedChannelId ? (
          <div className="p-4 text-center text-slate-500">
            No channel selected. Add one in Settings.
          </div>
        ) : loading ? (
          <div className="p-4 text-center text-slate-500">Loading...</div>
        ) : error ? (
          <div className="p-4 text-center text-red-400">{error}</div>
        ) : chats.length === 0 ? (
          <div className="p-4 text-center text-slate-500">
            No conversations yet. Messages from Line will appear here.
          </div>
        ) : (
          <ul className="divide-y divide-slate-800/50">
            {chats.map((chat) => (
              <li key={`${chat.channel_id}-${chat.line_user_id}`}>
                <button
                  onClick={() => onSelectUser(chat.line_user_id)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                    selectedUserId === chat.line_user_id
                      ? "bg-slate-800 text-white"
                      : "text-slate-300 hover:bg-slate-800/50"
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-medium text-slate-300">
                    {chat.profile_name?.[0]?.toUpperCase() || chat.line_user_id.slice(-2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {chat.profile_name || `User ${chat.line_user_id.slice(-6)}`}
                    </p>
                    <p className="truncate text-xs text-slate-500">
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
