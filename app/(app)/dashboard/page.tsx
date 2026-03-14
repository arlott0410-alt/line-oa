"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { fetchBatch, fetchQueue as fetchQueueApi } from "@/lib/api";
import { Sidebar, type QueueItem } from "@/components/Sidebar";
import { ChatPanel } from "@/components/ChatPanel";
import { OnboardingModal } from "@/components/OnboardingModal";
import { Notifications } from "@/components/Notifications";
import { isAdminOrAbove } from "@/lib/auth";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { X } from "lucide-react";

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
  const [showMyChatsOnly, setShowMyChatsOnly] = useState(false);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [canClaim, setCanClaim] = useState(false);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [adminStatus, setAdminStatus] = useState<"available" | "busy" | "offline">("offline");
  const [openChats, setOpenChats] = useState<Array<{ id: string; channelId: string; userId: string; chat: ChatUser }>>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      setSession(session as { access_token: string; user?: { id: string } });
      setCurrentUserId((session as { user?: { id: string } }).user?.id ?? null);
      isAdminOrAbove().then(setCanClaim);
    });
  }, [router]);

  useEffect(() => {
    if (!session || !canClaim) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from("admin_status").upsert(
          { user_id: user.id, status: "available", last_updated: new Date().toISOString() },
          { onConflict: "user_id" }
        ).then(() => setAdminStatus("available"));
      }
    });
  }, [session, canClaim]);

  const loadChannelsAndMaybeChats = useCallback(async () => {
    if (!session) return;
    setChannelError(null);
    const lastChannelId = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_LAST_CHANNEL) : null;
    const ops: Array<{ method: "get_channels" } | { method: "get_chats"; channel_id: string }> = [{ method: "get_channels" }];
    if (lastChannelId) ops.push({ method: "get_chats", channel_id: lastChannelId });
    try {
      const results = await fetchBatch(ops);
      const channelsData = Array.isArray(results[0]) ? results[0] : [];
      setChannels(channelsData);
      if (channelsData.length > 0) {
        setSelectedChannelId((prev) => {
          if (prev) return prev;
          const channelToSelect = lastChannelId && channelsData.some((c: { id: string }) => c.id === lastChannelId)
            ? lastChannelId
            : channelsData[0].id;
          return channelToSelect;
        });
      }
      if (channelsData.length === 0) setShowOnboarding(true);
    } catch (err) {
      const msg = (err as Error).message;
      setChannelError(msg);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    loadChannelsAndMaybeChats();
  }, [session]);

  const fetchQueue = async () => {
    if (!session || !canClaim) return;
    try {
      const data = await fetchQueueApi();
      setQueueItems(data);
    } catch {
      setQueueItems([]);
    }
  };

  const fetchAdminStatus = async () => {
    if (!session || !canClaim) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("admin_status").select("status").eq("user_id", user.id).single();
    if (data?.status) setAdminStatus(data.status as "available" | "busy" | "offline");
  };

  useEffect(() => {
    if (canClaim && session) {
      fetchQueue();
      fetchAdminStatus();
    }
  }, [canClaim, session]);

  useEffect(() => {
    if (!canClaim || !session) return;
    const channel = supabase
      .channel("dashboard-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "line_users" }, fetchQueue)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [canClaim, session]);

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

  const handleClaim = async (lineUserId: string, channelId: string, queueItem?: QueueItem) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("line_users")
      .update({ assigned_admin_id: user.id, queue_status: "assigned" })
      .eq("channel_id", channelId)
      .eq("line_user_id", lineUserId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("รับแชทแล้ว");
    const chat: ChatUser = queueItem
      ? {
          id: queueItem.id,
          line_user_id: queueItem.line_user_id,
          profile_name: queueItem.profile_name,
          avatar: null,
          last_active: queueItem.last_active,
          channel_id: queueItem.channel_id,
        }
      : {
          id: "",
          line_user_id: lineUserId,
          profile_name: null,
          avatar: null,
          last_active: new Date().toISOString(),
          channel_id: channelId,
        };
    addOrFocusChat(channelId, lineUserId, chat);
    fetchQueue();
  };

  const handleStatusChange = async (status: "available" | "busy" | "offline") => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("admin_status").upsert(
      { user_id: user.id, status, last_updated: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    setAdminStatus(status);
    toast.success(status === "available" ? "ว่าง" : status === "busy" ? "ไม่ว่าง" : "ออฟไลน์");
  };

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
          selectedUserId={selectedUserId}
          selectedChannelId={selectedChannelId}
          channels={channels}
          onSelectChannel={(id) => {
            if (id && typeof window !== "undefined") localStorage.setItem(STORAGE_KEY_LAST_CHANNEL, id);
            setSelectedChannelId(id);
            setSelectedUserId(null);
            setSelectedChat(null);
          }}
          onSelectUser={(id) => {
            setSelectedUserId(id);
            if (!id) setSelectedChat(null);
          }}
          onSelectChat={(chat) => {
            setSelectedChat(chat);
            if (chat && selectedChannelId) {
              addOrFocusChat(selectedChannelId, chat.line_user_id, chat);
            }
          }}
          token={session.access_token}
          channelError={channelError}
          showMyChatsOnly={showMyChatsOnly}
          onMyChatsToggle={setShowMyChatsOnly}
          showUnreadOnly={showUnreadOnly}
          onUnreadToggle={setShowUnreadOnly}
          canClaim={canClaim}
          queueItems={queueItems}
          onClaim={handleClaim}
          adminStatus={adminStatus}
          onStatusChange={handleStatusChange}
          notifications={
            currentUserId && canClaim ? (
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
        <div className="flex-1 flex flex-col min-w-0">
          {openChats.length === 0 ? (
            <ChatPanel
              selectedUserId={selectedUserId}
              selectedChannelId={selectedChannelId}
              selectedChannelName={
                channels.length > 1 && selectedChannelId
                  ? channels.find((c) => c.id === selectedChannelId)?.name ?? null
                  : null
              }
              selectedChat={selectedChat}
              token={session.access_token}
              onProfileUpdated={(name) =>
                setSelectedChat((c) => (c ? { ...c, profile_name: name } : null))
              }
              quickReplyTags={selectedChat?.tags ?? undefined}
              currentAdminId={currentUserId}
              onMarkViewed={(chId, uId) => {
                if (!currentUserId) return;
                supabase
                  .from("line_users")
                  .update({ viewed_by_admin_at: new Date().toISOString() })
                  .eq("channel_id", chId)
                  .eq("line_user_id", uId)
                  .eq("assigned_admin_id", currentUserId);
              }}
              showEscalation={canClaim}
              onResolve={
                canClaim && selectedChannelId && selectedUserId
                  ? (chId, uId) => {
                      const tabId = `${chId}-${uId}`;
                      closeTab(tabId);
                      if (selectedUserId === uId && selectedChannelId === chId) {
                        setSelectedUserId(null);
                        setSelectedChat(null);
                      }
                    }
                  : undefined
              }
              onEscalated={
                canClaim && selectedChannelId && selectedUserId
                  ? (chId, uId) => {
                      closeTab(`${chId}-${uId}`);
                      if (selectedUserId === uId && selectedChannelId === chId) {
                        setSelectedUserId(null);
                        setSelectedChat(null);
                      }
                    }
                  : undefined
              }
              onClaim={
                canClaim && currentUserId
                  ? async (chId, uId) => {
                      await handleClaim(uId, chId);
                      setSelectedChat((c) =>
                        c && c.line_user_id === uId && c.channel_id === chId
                          ? { ...c, assigned_admin_id: currentUserId }
                          : c
                      );
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
              <TabsList className="shrink-0 w-full justify-start rounded-none border-b bg-transparent p-0">
                {openChats.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="rounded-none border-b-2 border-transparent data-active:border-[#06C755] data-active:bg-transparent"
                  >
                    <span className="truncate max-w-24">
                      {tab.chat.profile_name || `User ${tab.userId.slice(-6)}`}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.id);
                      }}
                      className="ml-1 p-0.5 rounded hover:bg-gray-200"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </TabsTrigger>
                ))}
              </TabsList>
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
                    onMarkViewed={(chId, uId) => {
                      if (!currentUserId) return;
                      supabase
                        .from("line_users")
                        .update({ viewed_by_admin_at: new Date().toISOString() })
                        .eq("channel_id", chId)
                        .eq("line_user_id", uId)
                        .eq("assigned_admin_id", currentUserId);
                    }}
                    showEscalation={canClaim}
                    onResolve={
                      canClaim
                        ? (chId, uId) => {
                            const tabId = `${chId}-${uId}`;
                            closeTab(tabId);
                          }
                        : undefined
                    }
                    onEscalated={
                      canClaim && tab.channelId && tab.userId
                        ? (chId, uId) => closeTab(`${chId}-${uId}`)
                        : undefined
                    }
                    onClaim={
                      canClaim && currentUserId
                        ? async (chId, uId) => {
                            await handleClaim(uId, chId);
                            setOpenChats((prev) =>
                              prev.map((t) =>
                                t.channelId === chId && t.userId === uId
                                  ? { ...t, chat: { ...t.chat, assigned_admin_id: currentUserId } }
                                  : t
                              )
                            );
                          }
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
