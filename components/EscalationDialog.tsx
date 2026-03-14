"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchAdminUsers, type AdminUser } from "@/lib/api";
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
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      fetchAdminUsers()
        .then((data) =>
          setAdmins(
            data.filter(
              (u) =>
                ["admin", "super_admin"].includes(u.role) && u.id !== currentAdminId
            )
          )
        )
        .catch(() => setAdmins([]));
      setSelectedId("");
    }
  }, [open, currentAdminId]);

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
      onEscalated?.();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escalate to another admin</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Select admin</Label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">— Choose —</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.email} ({a.role})
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleEscalate}
            disabled={!selectedId || submitting}
            className="bg-[#06C755] hover:bg-[#05b04a]"
          >
            {submitting ? "Escalating..." : "Escalate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
