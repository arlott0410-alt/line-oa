"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { QueueItem } from "@/app/(app)/queue/page";
import { UserPlus } from "lucide-react";

interface QueueTableProps {
  items: QueueItem[];
  onClaim: (lineUserId: string, channelId: string) => void;
}

export function QueueTable({ items, onClaim }: QueueTableProps) {
  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No unassigned chats in queue.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Channel</TableHead>
          <TableHead>User</TableHead>
          <TableHead>Last Message</TableHead>
          <TableHead>Tags</TableHead>
          <TableHead>Last Active</TableHead>
          <TableHead className="w-[100px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={`${item.channel_id}-${item.line_user_id}`}>
            <TableCell className="font-medium">{item.channel_name}</TableCell>
            <TableCell>
              {item.profile_name || `User ${item.line_user_id.slice(-6)}`}
            </TableCell>
            <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
              {item.last_message?.content || "—"}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {(item.tags || []).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                  >
                    {tag}
                  </span>
                ))}
                {(!item.tags || item.tags.length === 0) && "—"}
              </div>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {item.last_active
                ? new Date(item.last_active).toLocaleString()
                : "—"}
            </TableCell>
            <TableCell>
              <Button
                size="sm"
                className="bg-[#06C755] hover:bg-[#05b04a]"
                onClick={() => onClaim(item.line_user_id, item.channel_id)}
              >
                <UserPlus className="mr-1 h-4 w-4" />
                Claim
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
