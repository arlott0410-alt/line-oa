"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Bell } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UnreadChat {
  channel_id: string;
  line_user_id: string;
  profile_name: string | null;
  channel_name?: string;
}

interface NotificationsProps {
  userId: string;
  onSelectChat?: (channelId: string, lineUserId: string) => void;
  channelNames?: Map<string, string>;
}

export function Notifications({
  userId,
  onSelectChat,
  channelNames = new Map(),
}: NotificationsProps) {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [chats, setChats] = useState<UnreadChat[]>([]);

  const fetchUnread = async () => {
    const { data, error } = await supabase
      .from("line_users")
      .select("channel_id, line_user_id, profile_name")
      .eq("assigned_admin_id", userId)
      .is("viewed_by_admin_at", null)
      .eq("queue_status", "assigned");
    if (error) return;
    const list = (data || []).map((c) => ({
      ...c,
      channel_name: channelNames.get(c.channel_id) || "—",
    }));
    setChats(list);
    setCount(list.length);
  };

  useEffect(() => {
    fetchUnread();
    const channel = supabase
      .channel("notifications-line-users")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "line_users" },
        () => fetchUnread()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const handleSelect = (channelId: string, lineUserId: string) => {
    supabase
      .from("line_users")
      .update({ viewed_by_admin_at: new Date().toISOString() })
      .eq("channel_id", channelId)
      .eq("line_user_id", lineUserId)
      .eq("assigned_admin_id", userId)
      .then(() => fetchUnread());
    onSelectChat?.(channelId, lineUserId);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative p-2 rounded-lg hover:bg-gray-100"
        title="New assigned chats"
      >
        <Bell className="h-5 w-5 text-gray-600" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New assigned chats ({count})</DialogTitle>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {chats.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No new assigned chats
              </p>
            ) : (
              chats.map((c) => (
                <button
                  key={`${c.channel_id}-${c.line_user_id}`}
                  type="button"
                  onClick={() => handleSelect(c.channel_id, c.line_user_id)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 text-left"
                >
                  <span className="font-medium truncate">
                    {c.profile_name || `User ${c.line_user_id.slice(-6)}`}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {c.channel_name}
                  </span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
