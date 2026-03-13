"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Sidebar } from "@/components/Sidebar";
import { ChatPanel } from "@/components/ChatPanel";

export interface ChatUser {
  id: string;
  line_user_id: string;
  profile_name: string | null;
  avatar: string | null;
  last_active: string;
  last_message?: {
    content: string;
    timestamp: string;
    sender_type: string;
  } | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [session, setSession] = useState<{ access_token: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      setSession(session);
    });
  }, [router]);

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <Sidebar
        selectedUserId={selectedUserId}
        onSelectUser={setSelectedUserId}
        token={session.access_token}
      />
      <ChatPanel
        selectedUserId={selectedUserId}
        token={session.access_token}
      />
    </div>
  );
}
