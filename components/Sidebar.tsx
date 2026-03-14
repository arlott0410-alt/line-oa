"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { ChatUser, Channel } from "@/app/(app)/dashboard/page";

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787";

export interface QueueItem {
  id: string;
  line_user_id: string;
  profile_name: string | null;
  channel_id: string;
  channel_name: string;
  last_active: string;
  tags: string[] | null;
  last_message: { content: string; timestamp: string } | null;
}

interface SidebarProps {
  selectedUserId: string | null;
  selectedChannelId: string | null;
  channels: Channel[];
  onSelectChannel: (channelId: string) => void;
  onSelectUser: (userId: string | null) => void;
  token: string;
  channelError?: string | null;
  showMyChatsOnly?: boolean;
  onMyChatsToggle?: (value: boolean) => void;
  canClaim?: boolean;
  queueItems?: QueueItem[];
  onClaim?: (lineUserId: string, channelId: string) => void;
  adminStatus?: "available" | "busy" | "offline";
  onStatusChange?: (status: "available" | "busy" | "offline") => void;
}

export function Sidebar({
  selectedUserId,
  selectedChannelId,
  channels,
  onSelectChannel,
  onSelectUser,
  token,
  channelError,
  showMyChatsOnly = false,
  onMyChatsToggle,
  canClaim = false,
  queueItems = [],
  onClaim,
  adminStatus = "offline",
  onStatusChange,
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
      let url = `${WORKER_URL}/chats?channel_id=${encodeURIComponent(selectedChannelId)}`;
      if (showMyChatsOnly) url += "&assigned_to=me";
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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
  }, [selectedChannelId, token, showMyChatsOnly]);

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
  }, [selectedChannelId, token, showMyChatsOnly]);

  return (
    <aside className="flex w-80 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-200 p-4 space-y-3">
        {canClaim && onStatusChange && (
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">สถานะ</p>
            <div className="flex gap-1">
              {(["available", "busy", "offline"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onStatusChange(s)}
                  className={`flex-1 rounded px-2 py-1.5 text-xs font-medium ${
                    adminStatus === s
                      ? s === "available"
                        ? "bg-green-600 text-white"
                        : s === "busy"
                        ? "bg-amber-500 text-white"
                        : "bg-gray-500 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {s === "available" ? "ว่าง" : s === "busy" ? "ไม่ว่าง" : "ออฟไลน์"}
                </button>
              ))}
            </div>
          </div>
        )}
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
        {onMyChatsToggle && canClaim && (
          <div className="mt-2 flex gap-1">
            <button
              type="button"
              onClick={() => onMyChatsToggle(false)}
              className={`flex-1 rounded px-2 py-1 text-xs font-medium ${!showMyChatsOnly ? "bg-[#06C755] text-white" : "bg-gray-100 text-gray-600"}`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => onMyChatsToggle(true)}
              className={`flex-1 rounded px-2 py-1 text-xs font-medium ${showMyChatsOnly ? "bg-[#06C755] text-white" : "bg-gray-100 text-gray-600"}`}
            >
              My Chats
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col">
        {canClaim && queueItems.length > 0 && onClaim && (
          <div className="border-b border-gray-200 p-3 bg-amber-50">
            <p className="text-xs font-semibold text-amber-800 mb-2">คิวรอรับ ({queueItems.length})</p>
            <ul className="space-y-1 max-h-32 overflow-y-auto">
              {queueItems.map((q) => (
                <li key={`${q.channel_id}-${q.line_user_id}`} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">
                      {q.profile_name || `User ${q.line_user_id.slice(-6)}`}
                    </p>
                    <p className="truncate text-xs text-gray-500">{q.channel_name} · {q.last_message?.content || "—"}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onClaim(q.line_user_id, q.channel_id)}
                    className="shrink-0 rounded bg-[#06C755] px-2 py-1 text-xs font-medium text-white hover:bg-[#05b04a]"
                  >
                    รับ
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
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
            {showMyChatsOnly ? "No chats assigned to you." : "No conversations yet. Messages from Line will appear here."}
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
