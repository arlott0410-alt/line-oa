"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Sidebar } from "@/components/Sidebar";
import { ChatPanel } from "@/components/ChatPanel";
import { OnboardingModal } from "@/components/OnboardingModal";

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
  const [channels, setChannels] = useState<Channel[]>([]);
  const [session, setSession] = useState<{ access_token: string } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      setSession(session);
    });
  }, [router]);

  useEffect(() => {
    if (!session) return;
    setChannelError(null);
    const fetchChannels = async () => {
      const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787";
      const res = await fetch(`${workerUrl}/channels`, {
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
          onSelectChannel={setSelectedChannelId}
          onSelectUser={setSelectedUserId}
          token={session.access_token}
          channelError={channelError}
        />
        <ChatPanel
          selectedUserId={selectedUserId}
          selectedChannelId={selectedChannelId}
          token={session.access_token}
        />
      </div>
    </>
  );
}
