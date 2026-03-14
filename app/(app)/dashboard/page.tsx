"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Sidebar, type QueueItem } from "@/components/Sidebar";
import { ChatPanel } from "@/components/ChatPanel";
import { OnboardingModal } from "@/components/OnboardingModal";
import { isAdminOrAbove } from "@/lib/auth";
import { toast } from "sonner";

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787";

export interface ChatUser {
  id: string;
  line_user_id: string;
  profile_name: string | null;
  avatar: string | null;
  last_active: string;
  channel_id?: string;
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
  const [session, setSession] = useState<{ access_token: string } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [showMyChatsOnly, setShowMyChatsOnly] = useState(false);
  const [canClaim, setCanClaim] = useState(false);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [adminStatus, setAdminStatus] = useState<"available" | "busy" | "offline">("offline");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      setSession(session);
      isAdminOrAbove().then(setCanClaim);
    });
  }, [router]);

  useEffect(() => {
    if (!session) return;
    setChannelError(null);
    const fetchChannels = async () => {
      const res = await fetch(`${WORKER_URL}/channels`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setChannels(data);
        if (data.length > 0 && !selectedChannelId) {
          setSelectedChannelId(data[0].id);
        }
        if (data.length === 0) {
          setShowOnboarding(true);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        const msg = err.detail || err.error || `Error ${res.status}`;
        setChannelError(msg);
      }
    };
    fetchChannels();
  }, [session]);

  const fetchQueue = async () => {
    if (!session || !canClaim) return;
    try {
      const res = await fetch(`${WORKER_URL}/queue`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) setQueueItems(await res.json());
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
      const interval = setInterval(fetchQueue, 10000);
      return () => clearInterval(interval);
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
    setSelectedChannelId(channelId);
    setSelectedUserId(lineUserId);
    setSelectedChat(
      queueItem
        ? {
            id: queueItem.id,
            line_user_id: queueItem.line_user_id,
            profile_name: queueItem.profile_name,
            avatar: null,
            last_active: queueItem.last_active,
            channel_id: queueItem.channel_id,
          }
        : null
    );
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
            setSelectedChannelId(id);
            setSelectedUserId(null);
            setSelectedChat(null);
          }}
          onSelectUser={(id) => {
            setSelectedUserId(id);
            if (!id) setSelectedChat(null);
          }}
          onSelectChat={setSelectedChat}
          token={session.access_token}
          channelError={channelError}
          showMyChatsOnly={showMyChatsOnly}
          onMyChatsToggle={setShowMyChatsOnly}
          canClaim={canClaim}
          queueItems={queueItems}
          onClaim={handleClaim}
          adminStatus={adminStatus}
          onStatusChange={handleStatusChange}
        />
        <ChatPanel
          selectedUserId={selectedUserId}
          selectedChannelId={selectedChannelId}
          selectedChat={selectedChat}
          token={session.access_token}
          onProfileUpdated={(name) =>
            setSelectedChat((c) => (c ? { ...c, profile_name: name } : null))
          }
        />
      </div>
    </>
  );
}
