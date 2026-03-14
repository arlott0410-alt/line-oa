"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isAdminOrAbove } from "@/lib/auth";
import { bulkAssignQueue, fetchQueue } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Crown, Clock } from "lucide-react";

interface QueueItem {
  id: string;
  line_user_id: string;
  profile_name: string | null;
  channel_id: string;
  channel_name: string;
  last_active: string;
  tags: string[] | null;
  vip_level?: number;
  last_message: { content: string; timestamp: string } | null;
}

function waitMinutes(lastActive: string): number {
  return Math.floor((Date.now() - new Date(lastActive).getTime()) / 60000);
}

export default function QueuePage() {
  const router = useRouter();
  const [session, setSession] = useState<{ access_token: string } | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      setSession(session);
      isAdminOrAbove().then(setAuthorized);
    });
  }, [router]);

  const loadQueue = async () => {
    if (!session) return;
    try {
      const data = await fetchQueue();
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session && authorized) loadQueue();
  }, [session, authorized]);

  useEffect(() => {
    if (!session || !authorized) return;
    const ch = supabase
      .channel("queue-updates")
      .on("postgres_changes", { event: "*", schema: "public", table: "line_users" }, loadQueue)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session, authorized]);

  const toggleSelect = (channelId: string, lineUserId: string) => {
    const key = `${channelId}-${lineUserId}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => `${i.channel_id}-${i.line_user_id}`)));
  };

  const handleBulkAssign = async () => {
    const toAssign = items.filter((i) =>
      selected.has(`${i.channel_id}-${i.line_user_id}`)
    );
    if (toAssign.length === 0) {
      toast.error("Select at least one chat");
      return;
    }
    setAssigning(true);
    try {
      await bulkAssignQueue(
        toAssign.map((i) => ({ channel_id: i.channel_id, line_user_id: i.line_user_id }))
      );
      toast.success(`Assigned ${toAssign.length} chat(s) to you`);
      setSelected(new Set());
      loadQueue();
      router.push("/dashboard");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAssigning(false);
    }
  };

  const handleClaimOne = async (item: QueueItem) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("line_users")
      .update({ assigned_admin_id: user.id, queue_status: "assigned" })
      .eq("channel_id", item.channel_id)
      .eq("line_user_id", item.line_user_id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("รับแชทแล้ว");
    loadQueue();
    router.push("/dashboard");
  };

  if (authorized === false) {
    router.replace("/dashboard");
    return null;
  }

  if (!session || authorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">คิวรอรับ</h1>
          <p className="text-sm text-muted-foreground">
            แชทที่ยังไม่มีคนรับ · เรียงตาม VIP ก่อน แล้วตามเวลารอ
          </p>
        </div>
        {items.length > 0 && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={toggleAll}
            >
              {selected.size === items.length ? "ยกเลิกทั้งหมด" : "เลือกทั้งหมด"}
            </Button>
            <Button
              onClick={handleBulkAssign}
              disabled={selected.size === 0 || assigning}
              className="bg-[#06C755] hover:bg-[#05b04a]"
            >
              {assigning ? "กำลังรับ..." : `รับไว้ทั้งหมด (${selected.size})`}
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground rounded-lg border bg-white">
          ไม่มีแชทในคิว — ลูกค้าส่งข้อความมาจะปรากฏที่นี่
        </div>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === items.length && items.length > 0}
                    onChange={toggleAll}
                  />
                </TableHead>
                <TableHead>ลูกค้า</TableHead>
                <TableHead>แชนเนล</TableHead>
                <TableHead>รอ</TableHead>
                <TableHead>ข้อความล่าสุด</TableHead>
                <TableHead className="w-24">ดำเนินการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const key = `${item.channel_id}-${item.line_user_id}`;
                const wait = waitMinutes(item.last_active);
                return (
                  <TableRow key={key}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggleSelect(item.channel_id, item.line_user_id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {(item.vip_level ?? 0) > 0 && (
                          <Crown className="h-4 w-4 text-amber-500" />
                        )}
                        <span className="font-medium">
                          {item.profile_name || `User ${item.line_user_id.slice(-6)}`}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {item.channel_name}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-sm">
                        <Clock className="h-3 w-3" />
                        {wait} min
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {item.last_message?.content || "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={() => handleClaimOne(item)}
                        className="bg-[#06C755] hover:bg-[#05b04a]"
                      >
                        รับ
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
