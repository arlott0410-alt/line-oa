"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { fetchBatch, fetchChannelsFromSupabase, type ChatFilterMode } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { ChatPanel } from "@/components/ChatPanel";
import { OnboardingModal } from "@/components/OnboardingModal";
import { Notifications } from "@/components/Notifications";
import { isAdminOrAbove } from "@/lib/auth";
import { toast } from "sonner";
import { Tabs, TabsContent } from "@/components/ui/tabs";

const STORAGE_KEY_LAST_CHANNEL = "line-oa-last-channel";

export interface ChatUser {
  id: string;
  line_user_id: string;
  profile_name: string | null;
  avatar: string | null;
  last_active: string;
  channel_id?: string;
  tags?: string[] | null;
  assigned_admin_id?: string | null;
  assigned_admin_display_name?: string | null;
  viewed_by_admin_at?: string | null;
  last_message?: {
    content: string;
    timestamp: string;
    sender_type: string;
  } | null;
}

export interface Channel {
  id: string;
  name: string;
  bot_user_id: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [selectedChat, setSelectedChat] = useState<ChatUser | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [session, setSession] = useState<{ access_token: string; user?: { id: string } } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [chatFilter, setChatFilter] = useState<ChatFilterMode>("all");
  const [openChats, setOpenChats] = useState<Array<{ id: string; channelId: string; userId: string; chat: ChatUser }>>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [refreshChatListKey, setRefreshChatListKey] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      setSession(session as { access_token: string; user?: { id: string } });
      setCurrentUserId((session as { user?: { id: string } }).user?.id ?? null);
    });
  }, [router]);


  const loadChannelsAndMaybeChats = useCallback(async (options?: { nocache?: boolean }) => {
    if (!session) return;
    setChannelError(null);
    setChannelsLoading(true);
    const lastChannelId = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_LAST_CHANNEL) : null;
    const ops: Array<{ method: "get_channels"; nocache?: boolean } | { method: "get_chats"; channel_id: string }> = [
      { method: "get_channels", ...(options?.nocache ? { nocache: true } : {}) },
    ];
    if (lastChannelId && lastChannelId !== "__all__") ops.push({ method: "get_chats", channel_id: lastChannelId });
    try {
      const results = await fetchBatch(ops);
      const first = results[0];
      if (first && typeof first === "object" && "error" in first && typeof (first as { error: string }).error === "string") {
        const raw = (first as { error: string }).error;
        let msg = raw;
        try {
          const parsed = JSON.parse(raw) as { error?: string; detail?: string };
          if (parsed.error) msg = parsed.detail ? `${parsed.error}: ${parsed.detail}` : parsed.error;
        } catch {
          /* ใช้ raw */
        }
        try {
          const fallbackChannels = await fetchChannelsFromSupabase();
          if (fallbackChannels.length > 0) {
            setChannels(fallbackChannels);
            setChannelError(null);
            const firstId = lastChannelId && fallbackChannels.some((c) => c.id === lastChannelId)
              ? lastChannelId
              : fallbackChannels[0].id;
            setSelectedChannelId(firstId);
            if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY_LAST_CHANNEL, firstId);
            return;
          }
        } catch {
          /* ใช้ fallback ไม่ได้ แสดง error เดิม */
        }
        setChannelError(msg);
        setChannels([]);
        toast.error("Failed to load channels: " + msg);
        return;
      }
      const channelsData = Array.isArray(first) ? first : [];
      setChannels(channelsData);
      if (channelsData.length > 0) {
        const validChannelId =
          lastChannelId && channelsData.some((c: { id: string }) => c.id === lastChannelId)
            ? lastChannelId
            : channelsData[0].id;
        setSelectedChannelId((prev) => prev || validChannelId);
        if (typeof window !== "undefined" && lastChannelId === "__all__")
          localStorage.setItem(STORAGE_KEY_LAST_CHANNEL, validChannelId);
      }
      if (channelsData.length === 0) setShowOnboarding(true);
    } catch (err) {
      const msg = (err as Error).message;
      try {
        const fallbackChannels = await fetchChannelsFromSupabase();
        if (fallbackChannels.length > 0) {
          setChannels(fallbackChannels);
          setChannelError(null);
          setSelectedChannelId(fallbackChannels[0].id);
          if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY_LAST_CHANNEL, fallbackChannels[0].id);
          return;
        }
      } catch {
        /* ใช้ fallback ไม่ได้ */
      }
      setChannelError(msg);
      setChannels([]);
      toast.error("Failed to load channels: " + msg);
    } finally {
      setChannelsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    loadChannelsAndMaybeChats();
  }, [session]);

  useEffect(() => {
    if (channels?.length > 0 && !selectedChannelId) {
      const firstId = channels[0].id;
      setSelectedChannelId(firstId);
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY_LAST_CHANNEL, firstId);
    }
  }, [channels, selectedChannelId]);

  const addOrFocusChat = (channelId: string, userId: string, chat: ChatUser) => {
    const id = `${channelId}-${userId}`;
    setOpenChats((prev) => {
      const exists = prev.some((c) => c.id === id);
      if (exists) return prev;
      return [...prev, { id, channelId, userId, chat }];
    });
    setActiveTabId(id);
    setSelectedChannelId(channelId);
    setSelectedUserId(userId);
    setSelectedChat(chat);
  };

  const closeTab = (tabId: string) => {
    setOpenChats((prev) => {
      const next = prev.filter((c) => c.id !== tabId);
      if (activeTabId === tabId) {
        const remaining = next[0];
        if (remaining) {
          setActiveTabId(remaining.id);
          setSelectedChannelId(remaining.channelId);
          setSelectedUserId(remaining.userId);
          setSelectedChat(remaining.chat);
        } else {
          setActiveTabId(null);
          setSelectedUserId(null);
          setSelectedChat(null);
          // ไม่ clear selectedChannelId — เพื่อให้ Sidebar ยังแสดงรายการแชทใน channel เดิม
        }
      }
      return next;
    });
  };

  const [isAdmin, setIsAdmin] = useState(false);
  const [currentAdminDisplayName, setCurrentAdminDisplayName] = useState<string | null>(null);
  useEffect(() => {
    if (session) isAdminOrAbove().then(setIsAdmin);
  }, [session]);
  useEffect(() => {
    if (!currentUserId) {
      setCurrentAdminDisplayName(null);
      return;
    }
    supabase
      .from("admin_profiles")
      .select("display_name")
      .eq("user_id", currentUserId)
      .single()
      .then(({ data }) => setCurrentAdminDisplayName((data as { display_name?: string } | null)?.display_name ?? null));
  }, [currentUserId]);

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <OnboardingModal
        open={showOnboarding}
        onOpenChange={setShowOnboarding}
      />
      <div className="flex h-full overflow-hidden">
        <Sidebar
          refreshChatListKey={refreshChatListKey}
          selectedUserId={selectedUserId}
          selectedChannelId={selectedChannelId}
          channels={channels}
          onSelectChannel={(id) => {
            if (id && typeof window !== "undefined") localStorage.setItem(STORAGE_KEY_LAST_CHANNEL, id);
            setSelectedChannelId(id);
            setSelectedUserId(null);
            setSelectedChat(null);
          }}
          channelsLoading={channelsLoading}
          selectedChat={selectedChat}
          onSelectUser={(id) => {
            setSelectedUserId(id);
            if (!id) setSelectedChat(null);
          }}
          onSelectChat={(chat) => {
            setSelectedChat(chat);
            if (chat) {
              const chId = chat.channel_id ?? selectedChannelId;
              if (chId) addOrFocusChat(chId, chat.line_user_id, chat);
            }
          }}
          token={session.access_token}
          channelError={channelError}
          onRefreshChannels={() => loadChannelsAndMaybeChats({ nocache: true })}
          chatFilter={chatFilter}
          onChatFilterChange={setChatFilter}
          notifications={
            currentUserId ? (
              <Notifications
                userId={currentUserId}
                onSelectChat={(channelId, lineUserId) => {
                  const chat = openChats.find(
                    (c) => c.channelId === channelId && c.userId === lineUserId
                  )?.chat ?? {
                    id: "",
                    line_user_id: lineUserId,
                    profile_name: null,
                    avatar: null,
                    last_active: new Date().toISOString(),
                    channel_id: channelId,
                  };
                  addOrFocusChat(channelId, lineUserId, chat);
                }}
                channelNames={new Map(channels.map((c) => [c.id, c.name]))}
              />
            ) : undefined
          }
        />
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {openChats.length === 0 ? (
            <ChatPanel
              selectedUserId={selectedUserId}
              selectedChannelId={selectedChannelId}
              selectedChannelName={
                selectedChannelId && channels.length > 1
                  ? channels.find((c) => c.id === selectedChannelId)?.name ?? null
                  : null
              }
              selectedChat={selectedChat}
              token={session.access_token}
              onClose={() => {
                setSelectedUserId(null);
                setSelectedChat(null);
              }}
              onMessageSent={() => setRefreshChatListKey((k) => k + 1)}
              onProfileUpdated={(name) =>
                setSelectedChat((c) => (c ? { ...c, profile_name: name } : null))
              }
              quickReplyTags={selectedChat?.tags ?? undefined}
              currentAdminId={currentUserId}
              currentAdminDisplayName={currentAdminDisplayName}
              onMarkViewed={(chId, uId) => {
                supabase
                  .from("line_users")
                  .update({ viewed_by_admin_at: new Date().toISOString() })
                  .eq("channel_id", chId)
                  .eq("line_user_id", uId)
                  .then(() => setRefreshChatListKey((k) => k + 1));
              }}
              showEscalation={isAdmin}
              onResolve={
                isAdmin && selectedChannelId && selectedUserId
                  ? (chId, uId) => {
                      const tabId = `${chId}-${uId}`;
                      closeTab(tabId);
                      if (selectedUserId === uId && selectedChannelId === chId) {
                        setSelectedUserId(null);
                        setSelectedChat(null);
                      }
                      setRefreshChatListKey((k) => k + 1);
                    }
                  : undefined
              }
              onEscalated={
                isAdmin && selectedChannelId && selectedUserId
                  ? (chId, uId) => {
                      closeTab(`${chId}-${uId}`);
                      if (selectedUserId === uId && selectedChannelId === chId) {
                        setSelectedUserId(null);
                        setSelectedChat(null);
                      }
                    }
                  : undefined
              }
            />
          ) : (
            <Tabs
              value={activeTabId ?? ""}
              onValueChange={(v) => {
                setActiveTabId(v);
                const t = openChats.find((c) => c.id === v);
                if (t) {
                  setSelectedChannelId(t.channelId);
                  setSelectedUserId(t.userId);
                  setSelectedChat(t.chat);
                }
              }}
              className="flex-1 flex flex-col min-h-0"
            >
              {openChats.map((tab) => (
                <TabsContent
                  key={tab.id}
                  value={tab.id}
                  className="flex-1 m-0 min-h-0 overflow-hidden"
                >
                  <ChatPanel
                    selectedUserId={tab.userId}
                    selectedChannelId={tab.channelId}
                    selectedChannelName={
                      channels.length > 1
                        ? channels.find((c) => c.id === tab.channelId)?.name ?? null
                        : null
                    }
                    selectedChat={tab.chat}
                    token={session.access_token}
                    onClose={() => closeTab(tab.id)}
                    onMessageSent={() => setRefreshChatListKey((k) => k + 1)}
                    onProfileUpdated={(name) => {
                      setOpenChats((prev) =>
                        prev.map((t) =>
                          t.id === tab.id
                            ? { ...t, chat: { ...t.chat, profile_name: name } }
                            : t
                        )
                      );
                      if (activeTabId === tab.id) setSelectedChat((c) => (c?.line_user_id === tab.userId ? { ...c, profile_name: name } : c));
                    }}
                    quickReplyTags={tab.chat.tags ?? undefined}
                    currentAdminId={currentUserId}
                    currentAdminDisplayName={currentAdminDisplayName}
                    onMarkViewed={(chId, uId) => {
                      supabase
                        .from("line_users")
                        .update({ viewed_by_admin_at: new Date().toISOString() })
                        .eq("channel_id", chId)
                        .eq("line_user_id", uId)
                        .then(() => setRefreshChatListKey((k) => k + 1));
                    }}
                    showEscalation={isAdmin}
                    onResolve={
                      isAdmin
                        ? (chId, uId) => {
                            const tabId = `${chId}-${uId}`;
                            closeTab(tabId);
                            setRefreshChatListKey((k) => k + 1);
                          }
                        : undefined
                    }
                    onEscalated={
                      isAdmin && tab.channelId && tab.userId
                        ? (chId, uId) => closeTab(`${chId}-${uId}`)
                        : undefined
                    }
                  />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>
      </div>
    </>
  );
}
