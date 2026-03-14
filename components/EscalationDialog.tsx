"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchColleagues } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowUpCircle } from "lucide-react";
import { toast } from "sonner";

interface EscalationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: string;
  lineUserId: string;
  currentAdminId: string;
  onEscalated?: () => void;
}

export function EscalationDialog({
  open,
  onOpenChange,
  channelId,
  lineUserId,
  currentAdminId,
  onEscalated,
}: EscalationDialogProps) {
  const [colleagues, setColleagues] = useState<{ id: string; email: string; display_name?: string | null }[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [showOffline, setShowOffline] = useState(false);

  useEffect(() => {
    if (open) {
      fetchColleagues(!showOffline)
        .then(setColleagues)
        .catch(() => setColleagues([]));
      setSelectedId("");
    }
  }, [open, showOffline]);

  const handleEscalate = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("line_users")
        .update({
          assigned_admin_id: selectedId,
          queue_status: "assigned",
          viewed_by_admin_at: null,
        })
        .eq("channel_id", channelId)
        .eq("line_user_id", lineUserId);
      if (error) throw error;

      await supabase.from("messages").insert({
        channel_id: channelId,
        line_user_id: lineUserId,
        sender_type: "admin",
        content: "[Escalated]",
        escalated_to: selectedId,
      });
      toast.success("ส่งแชทให้เพื่อนแล้ว");
      onEscalated?.();
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ส่งแชทให้เพื่อน</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={showOffline}
                onChange={(e) => setShowOffline(e.target.checked)}
              />
              แสดงทุกคน (รวมออฟไลน์)
            </label>
          </div>
          <div>
            <Label>เลือกเพื่อนที่จะส่งแชทให้</Label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">— เลือก —</option>
              {colleagues.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name ? `${c.display_name} (${c.email})` : c.email}
                </option>
              ))}
            </select>
            {colleagues.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {showOffline ? "ไม่มี admin อื่นในระบบ" : "ไม่มีเพื่อนออนไลน์ — ลองติ๊กแสดงทุกคน"}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button
            onClick={handleEscalate}
            disabled={!selectedId || submitting}
            className="bg-[#06C755] hover:bg-[#05b04a]"
          >
            {submitting ? "กำลังส่ง..." : "ส่งแชท"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
