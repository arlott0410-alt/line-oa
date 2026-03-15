"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { fetchChats } from "@/lib/api";
import debounce from "lodash/debounce";
import { CircleDot, Clock, CircleOff } from "lucide-react";
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
  selectedUserId: string | null;
  selectedChannelId: string | null;
  channels: Channel[];
  /** เมื่อเลือก "ทั้งหมดทุก LINE" จะส่ง object แชทแยกตาม channel_id */
  chatsByChannel?: Record<string, ChatUser[]>;
  allChannelsLoading?: boolean;
  /** แชทที่กำลังเลือก (ใช้ไฮไลต์ในโหมดทั้งหมดทุก LINE) */
  selectedChat?: ChatUser | null;
  onSelectChannel: (channelId: string) => void;
  onSelectUser: (userId: string | null) => void;
  onSelectChat?: (chat: ChatUser | null) => void;
  token: string;
  channelError?: string | null;
  onRefreshChannels?: () => void;
  showMyChatsOnly?: boolean;
  onMyChatsToggle?: (value: boolean) => void;
  showUnreadOnly?: boolean;
  onUnreadToggle?: (value: boolean) => void;
  canClaim?: boolean;
  queueItems?: QueueItem[];
  onClaim?: (lineUserId: string, channelId: string, queueItem?: QueueItem) => void;
  adminStatus?: "available" | "busy" | "offline";
  onStatusChange?: (status: "available" | "busy" | "offline") => void;
  notifications?: React.ReactNode;
}

export function Sidebar({
  selectedUserId,
  selectedChannelId,
  channels,
  chatsByChannel,
  allChannelsLoading = false,
  selectedChat,
  onSelectChannel,
  onSelectUser,
  onSelectChat,
  token,
  channelError,
  onRefreshChannels,
  showMyChatsOnly = false,
  onMyChatsToggle,
  showUnreadOnly = false,
  onUnreadToggle,
  canClaim = false,
  queueItems = [],
  onClaim,
  adminStatus = "offline",
  onStatusChange,
  notifications,
}: SidebarProps) {
  const [chats, setChats] = useState<ChatUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadChats = useCallback(async () => {
    if (!selectedChannelId || selectedChannelId === ALL_CHANNELS_ID) {
      setChats([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await fetchChats(selectedChannelId, {
        assignedToMe: showMyChatsOnly || showUnreadOnly,
        unreadOnly: showUnreadOnly,
      });
      setChats(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedChannelId, showMyChatsOnly, showUnreadOnly]);

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
    debouncedLoadChats();
    return () => debouncedLoadChats.cancel();
  }, [selectedChannelId, token, showMyChatsOnly, showUnreadOnly, debouncedLoadChats]);

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
        loadChats
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "line_users",
          filter: `channel_id=eq.${selectedChannelId}`,
        },
        loadChats
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedChannelId, loadChats]);

  return (
    <aside className="flex w-80 flex-col border-r border-gray-200 bg-white">
      <div className="border-b border-gray-200 p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
        {notifications}
        {canClaim && onStatusChange && (
          <div className="flex items-center gap-1 shrink-0">
            {(["available", "busy", "offline"] as const).map((s) => {
              const labels = { available: "ว่าง", busy: "ไม่ว่าง", offline: "ออฟไลน์" };
              const isActive = adminStatus === s;
              const styles = isActive
                ? s === "available"
                  ? "bg-green-600 text-white"
                  : s === "busy"
                  ? "bg-amber-500 text-white"
                  : "bg-gray-500 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200";
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onStatusChange(s)}
                  title={labels[s]}
                  className={`rounded-full p-1.5 transition ${styles}`}
                >
                  {s === "available" ? (
                    <CircleDot className="h-4 w-4" />
                  ) : s === "busy" ? (
                    <Clock className="h-4 w-4" />
                  ) : (
                    <CircleOff className="h-4 w-4" />
                  )}
                </button>
              );
            })}
          </div>
        )}
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
        {selectedChannelId && (onMyChatsToggle != null || onUnreadToggle != null) && (
          <div className="mt-2 space-y-1.5">
            <p className="text-xs font-semibold text-gray-700">กรองแชท</p>
            <div className="flex gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  onMyChatsToggle?.(false);
                  onUnreadToggle?.(false);
                }}
                className={`flex-1 min-w-[4rem] rounded px-2 py-1.5 text-xs font-medium transition ${!showMyChatsOnly && !showUnreadOnly ? "bg-[#06C755] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                title="แชททั้งหมดใน channel (รวมที่ยังไม่มีคนรับ)"
              >
                ทั้งหมด
              </button>
              <button
                type="button"
                onClick={() => {
                  onMyChatsToggle?.(true);
                  onUnreadToggle?.(false);
                }}
                disabled={!canClaim}
                className={`flex-1 min-w-[4rem] rounded px-2 py-1.5 text-xs font-medium transition ${showMyChatsOnly && !showUnreadOnly ? "bg-[#06C755] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"} ${!canClaim ? "opacity-60 cursor-not-allowed" : ""}`}
                title={canClaim ? "แชทที่คุณกดรับไว้แล้ว — ใช้ดูแชทที่รับผิดชอบอยู่" : "ต้องมีสิทธิ์รับแชท"}
              >
                รับไว้แล้ว
              </button>
              <button
                type="button"
                onClick={() => {
                  onMyChatsToggle?.(true);
                  onUnreadToggle?.(true);
                }}
                disabled={!canClaim}
                className={`flex-1 min-w-[4rem] rounded px-2 py-1.5 text-xs font-medium transition ${showUnreadOnly ? "bg-[#06C755] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"} ${!canClaim ? "opacity-60 cursor-not-allowed" : ""}`}
                title={canClaim ? "แชทที่ลูกค้าส่งมาล่าสุดและยังไม่ได้เปิดดู — ตอบด่วน" : "ต้องมีสิทธิ์รับแชท"}
              >
                ยังไม่อ่าน
              </button>
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
              <strong>เรื่องสิทธิ์ (error 1042):</strong> เปิด Supabase → SQL Editor → รันไฟล์ <code className="bg-gray-100 px-1 rounded">supabase/fix_channels_1042.sql</code> (ใส่ role ให้ User ในตาราง user_roles)
              <br />
              <strong>Worker:</strong> ต้องมี <strong>SUPABASE_URL</strong> และ <strong>SUPABASE_ANON_KEY</strong> ใน Cloudflare → Variables
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
        ) : !selectedChannelId ? (
          <div className="p-4 text-center text-gray-500 space-y-2">
            <p>No channel selected. Add one in Settings.</p>
            {onRefreshChannels && (
              <button
                type="button"
                onClick={onRefreshChannels}
                className="text-xs text-green-600 hover:underline"
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
                        <li className="py-2 text-center text-xs text-gray-400">ยังไม่มีแชท</li>
                      ) : (
                        list.map((chat) => (
                          <li key={`${chat.channel_id}-${chat.line_user_id}`}>
                            <button
                              onClick={() => {
                                onSelectUser(chat.line_user_id);
                                onSelectChat?.(chat);
                              }}
                              className={`flex w-full items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-all duration-200 ${
                                selectedChat?.channel_id === ch.id && selectedChat?.line_user_id === chat.line_user_id
                                  ? "border-[#06C755] bg-[#06C755] text-white shadow-md"
                                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm"
                              }`}
                            >
                              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
                                selectedChat?.channel_id === ch.id && selectedChat?.line_user_id === chat.line_user_id ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"
                              }`}>
                                {chat.profile_name?.[0]?.toUpperCase() || chat.line_user_id.slice(-2)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium">
                                  {chat.profile_name || `User ${chat.line_user_id.slice(-6)}`}
                                </p>
                                <p className={`truncate text-xs ${selectedChat?.channel_id === ch.id && selectedChat?.line_user_id === chat.line_user_id ? "text-white/80" : "text-gray-500"}`}>
                                  {chat.last_message?.content || "No messages"}
                                </p>
                                {chat.assigned_admin_display_name && (
                                  <p className={`truncate text-[10px] mt-0.5 ${selectedChat?.channel_id === ch.id && selectedChat?.line_user_id === chat.line_user_id ? "text-white/70" : "text-gray-400"}`}>
                                    รับโดย: {chat.assigned_admin_display_name}
                                  </p>
                                )}
                              </div>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          )
        ) : loading ? (
          <div className="p-4 text-center text-gray-500">Loading...</div>
        ) : error ? (
          <div className="p-4 text-center text-red-600">{error}</div>
        ) : chats.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            {showUnreadOnly
              ? "ไม่มีแชทที่ยังไม่อ่าน"
              : showMyChatsOnly
              ? "ยังไม่มีแชทที่รับไว้ — ไปที่ Queue หรือกด รับ ในคิวรอรับด้านบน"
              : "ยังไม่มีแชท — ลูกค้าส่งข้อความมาจะปรากฏที่นี่"}
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
            {chats.map((chat) => (
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
                    {chat.assigned_admin_display_name && (
                      <p className={`truncate text-[10px] mt-0.5 ${selectedUserId === chat.line_user_id ? "text-white/70" : "text-gray-400"}`}>
                        รับโดย: {chat.assigned_admin_display_name}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          </>
        )}
      </div>
    </aside>
  );
}
