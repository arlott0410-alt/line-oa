"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { ChatUser } from "@/app/dashboard/page";

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787";

interface SidebarProps {
  selectedUserId: string | null;
  onSelectUser: (userId: string | null) => void;
  token: string;
}

export function Sidebar({ selectedUserId, onSelectUser, token }: SidebarProps) {
  const router = useRouter();
  const [chats, setChats] = useState<ChatUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchChats = async () => {
    try {
      const res = await fetch(`${WORKER_URL}/chats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
    fetchChats();
    const interval = setInterval(fetchChats, 15000);
    return () => clearInterval(interval);
  }, [token]);

  // Subscribe to new messages for sidebar refresh
  useEffect(() => {
    const channel = supabase
      .channel("sidebar-messages")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => fetchChats()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [token]);

  return (
    <aside className="flex w-80 flex-col border-r border-slate-800 bg-slate-900/50">
      <div className="border-b border-slate-800 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">LineUnifiedInbox</h2>
            <p className="text-xs text-slate-400">Line users</p>
          </div>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.replace("/login");
            }}
            className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
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
              <li key={chat.line_user_id}>
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
