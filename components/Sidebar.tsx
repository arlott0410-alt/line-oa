"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { fetchChats } from "@/lib/api";
import debounce from "lodash/debounce";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import type { ChatFilterMode } from "@/lib/api";
import type { ChatUser, Channel } from "@/app/(app)/dashboard/page";

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

const ALL_CHANNELS_ID = "__all__";

interface SidebarProps {
  /** เปลี่ยนค่าเมื่อต้องการให้รายการแชทโหลดใหม่ (เช่น หลัง mark อ่านแล้ว) */
  refreshChatListKey?: number;
  selectedUserId: string | null;
  selectedChannelId: string | null;
  channels: Channel[];
  /** เมื่อเลือก "ทั้งหมดทุก LINE" จะส่ง object แชทแยกตาม channel_id */
  chatsByChannel?: Record<string, ChatUser[]>;
  allChannelsLoading?: boolean;
  channelsLoading?: boolean;
  /** แชทที่กำลังเลือก (ใช้ไฮไลต์ในโหมดทั้งหมดทุก LINE) */
  selectedChat?: ChatUser | null;
  onSelectChannel: (channelId: string) => void;
  onSelectUser: (userId: string | null) => void;
  onSelectChat?: (chat: ChatUser | null) => void;
  token: string;
  channelError?: string | null;
  onRefreshChannels?: () => void;
  chatFilter?: ChatFilterMode;
  onChatFilterChange?: (value: ChatFilterMode) => void;
  canClaim?: boolean;
  queueItems?: QueueItem[];
  onClaim?: (lineUserId: string, channelId: string, queueItem?: QueueItem) => void;
  notifications?: React.ReactNode;
}

/** สีประจำ channel จาก id (คงที่ต่อ channel) */
function getChannelColor(channelId: string): string {
  let h = 0;
  for (let i = 0; i < channelId.length; i++) h = (h * 31 + channelId.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue}, 52%, 42%)`;
}

export function Sidebar({
  refreshChatListKey = 0,
  selectedUserId,
  selectedChannelId,
  channels,
  chatsByChannel,
  allChannelsLoading = false,
  channelsLoading = false,
  selectedChat,
  onSelectChannel,
  onSelectUser,
  onSelectChat,
  token,
  channelError,
  onRefreshChannels,
  chatFilter = "all",
  onChatFilterChange,
  canClaim = false,
  queueItems = [],
  onClaim,
  notifications,
}: SidebarProps) {
  const [chats, setChats] = useState<ChatUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadChats = useCallback(async (opts?: { nocache?: boolean }) => {
    if (!selectedChannelId || selectedChannelId === ALL_CHANNELS_ID) {
      setChats([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await fetchChats(selectedChannelId, {
        status: chatFilter,
        nocache: opts?.nocache,
      });
      setChats(Array.isArray(data) ? data : []);
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      toast.error("Failed to load chats: " + msg);
    } finally {
      setLoading(false);
    }
  }, [selectedChannelId, chatFilter]);

  const debouncedLoadChats = useMemo(
    () => debounce(loadChats, 300),
    [loadChats]
  );

  useEffect(() => {
    if (!selectedChannelId || selectedChannelId === ALL_CHANNELS_ID) {
      setChats([]);
      setLoading(false);
      return;
    }
    if (refreshChatListKey > 0) {
      loadChats({ nocache: true });
    } else {
      debouncedLoadChats();
    }
    return () => debouncedLoadChats.cancel();
  }, [selectedChannelId, token, chatFilter, debouncedLoadChats, refreshChatListKey, loadChats]);

  useEffect(() => {
    if (!selectedChannelId || selectedChannelId === ALL_CHANNELS_ID) return;
    const channel = supabase
      .channel(`sidebar-updates-${selectedChannelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${selectedChannelId}`,
        },
        (payload) => {
          console.log("New message via realtime:", payload);
          loadChats();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "line_users",
          filter: `channel_id=eq.${selectedChannelId}`,
        },
        (payload) => {
          console.log("New message via realtime (line_users):", payload);
          loadChats();
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" && err) toast.error("Realtime error: " + (err?.message ?? String(err)));
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedChannelId, loadChats]);

  return (
    <aside className="flex w-80 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-200 p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
        {notifications}
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-gray-900 truncate">Chats</h2>
          {channels.length > 1 && (
            <span className="text-[10px] text-gray-400">{channels.length} แชนเนล</span>
          )}
        </div>
        </div>
        {channels.length > 0 && (
          <select
            value={selectedChannelId || ""}
            onChange={(e) => onSelectChannel(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#06C755] focus:outline-none focus:ring-2 focus:ring-[#06C755]/20"
          >
            <option value={ALL_CHANNELS_ID}>ทั้งหมดทุก LINE</option>
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.name}
              </option>
            ))}
          </select>
        )}
        {selectedChannelId && onChatFilterChange != null && (
          <div className="mt-2 space-y-1.5">
            <p className="text-xs font-semibold text-gray-700">กรองแชท</p>
            <div className="flex gap-1 flex-wrap">
              {(["all", "unread", "in_progress", "resolved"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onChatFilterChange(mode)}
                  className={`flex-1 min-w-[4rem] rounded px-2 py-1.5 text-xs font-medium transition ${chatFilter === mode ? "bg-[#06C755] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                  title={
                    mode === "all"
                      ? "แชททั้งหมด"
                      : mode === "unread"
                      ? "แชทที่ลูกค้าส่งมาและยังไม่ได้เปิดดู"
                      : mode === "in_progress"
                      ? "แชทที่กำลังดำเนินการ (มีคนรับแล้ว)"
                      : "แชทที่จบเคสแล้ว"
                  }
                >
                  {mode === "all"
                    ? "ทั้งหมด"
                    : mode === "unread"
                    ? "ยังไม่อ่าน"
                    : mode === "in_progress"
                    ? "ดำเนินการ"
                    : "เสร็จสิ้น"}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col">
        {canClaim && queueItems.length > 0 && onClaim && (
          <div className="border-b border-gray-200 p-3 bg-amber-50">
            <p className="text-xs font-semibold text-amber-800 mb-1">คิวรอรับ ({queueItems.length})</p>
            <p className="text-[10px] text-amber-700 mb-2">กด รับ เพื่อรับแชทมาทำงาน</p>
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
                    onClick={() => onClaim(q.line_user_id, q.channel_id, q)}
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
              <strong>Error 1042:</strong> เปิด Supabase → SQL Editor → รันตามขั้นตอนใน <code className="bg-gray-100 px-1 rounded">supabase/fix_channels_1042.sql</code>
              <br />
              (ถ้ามี role ครบแล้ว: ตรวจว่ามี function <code>get_my_role</code> และ Worker ใช้ <strong>SUPABASE_URL</strong> / <strong>SUPABASE_ANON_KEY</strong> ของโปรเจกต์นี้)
            </p>
            {onRefreshChannels && (
              <p className="text-center pt-2">
                <button
                  type="button"
                  onClick={onRefreshChannels}
                  className="rounded bg-[#06C755] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#05b04a]"
                >
                  โหลดใหม่ (ล้าง cache)
                </button>
              </p>
            )}
          </div>
        ) : channelsLoading && channels.length === 0 ? (
          <div className="p-4 text-center text-gray-500 flex flex-col items-center gap-2">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#06C755] border-t-transparent" />
            <p className="text-sm">Loading channels...</p>
          </div>
        ) : !selectedChannelId ? (
          <div className="p-4 text-center text-gray-500 space-y-3">
            <p className="text-sm">No channel selected. Add a Line OA in Settings to see chats.</p>
            <Link
              href="/settings"
              className="inline-block rounded bg-[#06C755] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#05b04a]"
            >
              ไปที่ Settings
            </Link>
            {onRefreshChannels && (
              <button
                type="button"
                onClick={onRefreshChannels}
                className="block w-full mt-2 text-xs text-gray-500 hover:underline"
              >
                โหลดใหม่ (ล้าง cache)
              </button>
            )}
          </div>
        ) : selectedChannelId === ALL_CHANNELS_ID ? (
          allChannelsLoading ? (
            <div className="p-4 text-center text-gray-500">Loading...</div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {channels.map((ch) => {
                const list = chatsByChannel?.[ch.id] ?? [];
                return (
                  <div key={ch.id} className="border-b border-gray-200">
                    <div className="sticky top-0 z-10 bg-gray-100 px-3 py-2">
                      <p className="text-xs font-semibold text-gray-500">มาจาก LINE</p>
                      <p className="truncate text-sm font-medium text-gray-900">{ch.name}</p>
                    </div>
                    <ul className="space-y-2 p-3">
                      {list.length === 0 ? (
                        <li className="py-4 text-center text-gray-400 flex flex-col items-center gap-1">
                          <MessageCircle className="h-8 w-8 text-gray-300" strokeWidth={1.2} />
                          <span className="text-xs">No conversations yet in this channel.</span>
                        </li>
                      ) : (
                        list.map((chat) => {
                          const channelColor = getChannelColor(ch.id);
                          const isSelected = selectedChat?.channel_id === ch.id && selectedChat?.line_user_id === chat.line_user_id;
                          const isUnread = chat.last_message?.sender_type === "user" && (!chat.viewed_by_admin_at || new Date(chat.viewed_by_admin_at) < new Date(chat.last_message?.timestamp ?? 0));
                          return (
                          <li key={`${chat.channel_id}-${chat.line_user_id}`}>
                            <button
                              onClick={() => {
                                onSelectUser(chat.line_user_id);
                                onSelectChat?.(chat);
                              }}
                              className={`flex w-full items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-all duration-200 ${
                                isSelected
                                  ? "border-[#06C755] bg-[#06C755] text-white shadow-md"
                                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm"
                              }`}
                              style={!isSelected ? { borderLeftWidth: "4px", borderLeftColor: channelColor } : undefined}
                            >
                              <div className="relative shrink-0">
                                <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium ${
                                  isSelected ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"
                                }`}>
                                  {chat.profile_name?.[0]?.toUpperCase() || chat.line_user_id.slice(-2)}
                                </div>
                                {isUnread && (
                                  <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#06C755] border-2 border-white" aria-hidden />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <span
                                  className="mb-0.5 inline-block truncate rounded px-1.5 py-0.5 text-[10px] font-medium"
                                  style={
                                    isSelected
                                      ? { backgroundColor: "rgba(255,255,255,0.25)", color: "white" }
                                      : { backgroundColor: channelColor.replace(/\)$/, ", 0.15)").replace(/^hsl\(/, "hsla("), color: channelColor }
                                  }
                                  title={ch.name}
                                >
                                  {ch.name}
                                </span>
                                <p className="truncate font-medium">
                                  {chat.profile_name || `User ${chat.line_user_id.slice(-6)}`}
                                </p>
                                <p className={`truncate text-xs ${isSelected ? "text-white/80" : "text-gray-500"}`}>
                                  {chat.last_message?.content || "No messages"}
                                </p>
                                {chat.assigned_admin_display_name && (
                                  <p className={`truncate text-[10px] mt-0.5 ${isSelected ? "text-white/70" : "text-gray-400"}`}>
                                    รับโดย: {chat.assigned_admin_display_name}
                                  </p>
                                )}
                              </div>
                            </button>
                          </li>
                          );
                        })
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          )
        ) : loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
                <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 rounded bg-gray-200 animate-pulse" />
                  <div className="h-3 w-1/2 rounded bg-gray-100 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-4 text-center space-y-2">
            <p className="text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={() => loadChats()}
              className="rounded bg-[#06C755] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#05b04a]"
            >
              โหลดใหม่
            </button>
          </div>
        ) : chats.length === 0 ? (
          <div className="p-4">
            <div className="rounded-lg border-2 border-dashed border-gray-200 bg-gray-50/50 p-6 text-center flex flex-col items-center gap-3">
              <MessageCircle className="h-12 w-12 text-gray-300" strokeWidth={1.2} />
              <p className="text-sm font-medium text-gray-700">No conversations in this channel yet</p>
              <p className="text-xs text-gray-500">
                {chatFilter === "unread"
                  ? "ไม่มีแชทที่ยังไม่อ่าน"
                  : chatFilter === "in_progress"
                  ? "ไม่มีแชทที่กำลังดำเนินการ"
                  : chatFilter === "resolved"
                  ? "ไม่มีแชทที่เสร็จสิ้น"
                  : "Send a message via Line OA to start chatting."}
              </p>
              <button
                type="button"
                onClick={() => loadChats()}
                className="rounded bg-[#06C755] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#05b04a]"
              >
                โหลดใหม่
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-xs font-semibold text-gray-500">มาจาก LINE</p>
              <p className="truncate text-sm font-medium text-gray-900" title={channels.find((c) => c.id === selectedChannelId)?.name}>
                {channels.find((c) => c.id === selectedChannelId)?.name ?? "—"}
              </p>
            </div>
            <ul className="space-y-2 p-3">
            {chats.map((chat) => {
              const chId = chat.channel_id ?? selectedChannelId;
              const chName = chId ? channels.find((c) => c.id === chId)?.name : null;
              const channelColor = chId ? getChannelColor(chId) : undefined;
              const isUnread = chat.last_message?.sender_type === "user" && (!chat.viewed_by_admin_at || new Date(chat.viewed_by_admin_at) < new Date(chat.last_message?.timestamp ?? 0));
              return (
              <li key={`${chat.channel_id}-${chat.line_user_id}`}>
                <button
                  onClick={() => {
                    onSelectUser(chat.line_user_id);
                    onSelectChat?.(chat);
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-all duration-200 ${
                    selectedUserId === chat.line_user_id
                      ? "border-[#06C755] bg-[#06C755] text-white shadow-md"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm"
                  }`}
                  style={channelColor && selectedUserId !== chat.line_user_id ? { borderLeftWidth: "4px", borderLeftColor: channelColor } : undefined}
                >
                  <div className="relative shrink-0">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium ${
                      selectedUserId === chat.line_user_id ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"
                    }`}>
                      {chat.profile_name?.[0]?.toUpperCase() || chat.line_user_id.slice(-2)}
                    </div>
                    {isUnread && (
                      <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#06C755] border-2 border-white" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    {chName && (
                      <span
                        className="mb-0.5 inline-block truncate rounded px-1.5 py-0.5 text-[10px] font-medium"
                        style={
                          selectedUserId === chat.line_user_id
                            ? { backgroundColor: "rgba(255,255,255,0.25)", color: "white" }
                            : { backgroundColor: channelColor ? channelColor.replace(/\)$/, ", 0.15)").replace(/^hsl\(/, "hsla(") : undefined, color: channelColor }
                        }
                        title={chName}
                      >
                        {chName}
                      </span>
                    )}
                    <p className="truncate font-medium">
                      {chat.profile_name || `User ${chat.line_user_id.slice(-6)}`}
                    </p>
                    <p className={`truncate text-xs ${selectedUserId === chat.line_user_id ? "text-white/80" : "text-gray-500"}`}>
                      {chat.last_message?.content || "No messages"}
                    </p>
                    {chat.assigned_admin_display_name && (
                      <p className={`truncate text-[10px] mt-0.5 ${selectedUserId === chat.line_user_id ? "text-white/70" : "text-gray-400"}`}>
                        รับโดย: {chat.assigned_admin_display_name}
                      </p>
                    )}
                  </div>
                </button>
              </li>
              );
            })}
          </ul>
          </>
        )}
      </div>
    </aside>
  );
}
