"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isAdminOrAbove } from "@/lib/auth";
import { toast } from "sonner";
import { QueueTable } from "@/components/QueueTable";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

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

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787";

export default function QueuePage() {
  const router = useRouter();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  const fetchQueue = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${WORKER_URL}/queue`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch queue");
      const data = await res.json();
      setItems(data);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      isAdminOrAbove().then((ok) => {
        setAuthorized(ok);
        if (!ok) {
          toast.error("Access denied. Admin or Super Admin required.");
          router.replace("/dashboard");
        }
      });
    });
  }, [router]);

  useEffect(() => {
    if (authorized) fetchQueue();
  }, [authorized]);

  useEffect(() => {
    if (!authorized) return;
    const channel = supabase
      .channel("queue-line-users")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "line_users" },
        () => fetchQueue()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [authorized]);

  const handleClaim = async (lineUserId: string, channelId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("line_users")
      .update({
        assigned_admin_id: user.id,
        queue_status: "assigned",
      })
      .eq("channel_id", channelId)
      .eq("line_user_id", lineUserId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Chat claimed! Open Dashboard to view.");
    fetchQueue();
  };

  if (authorized === false || authorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="mb-2 -ml-2">
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
            <h1 className="text-2xl font-bold">Chat Queue</h1>
            <p className="text-sm text-muted-foreground">
              Unassigned chats. Claim to assign to yourself and open in Dashboard.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              Loading...
            </div>
          ) : (
            <QueueTable items={items} onClaim={handleClaim} />
          )}
        </div>
      </div>
    </div>
  );
}
