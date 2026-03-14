"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { MessageSquarePlus } from "lucide-react";

export interface QuickReply {
  id: string;
  title: string;
  content: string;
  tags: string[] | null;
}

interface QuickRepliesProps {
  onSelect: (content: string) => void;
  filterTags?: string[];
  disabled?: boolean;
  className?: string;
}

export function QuickReplies({
  onSelect,
  filterTags = [],
  disabled,
  className,
}: QuickRepliesProps) {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchReplies = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("quick_replies")
        .select("id, title, content, tags")
        .order("title");
      if (!error) setReplies(data || []);
      setLoading(false);
    };
    fetchReplies();
  }, []);

  const filtered = filterTags.length
    ? replies.filter((r) => {
        const tags = r.tags || [];
        return filterTags.some((t) => tags.includes(t));
      })
    : replies;

  return (
    <div className={`relative ${className ?? ""}`}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || loading}
        title="Quick replies"
        className="shrink-0"
      >
        <MessageSquarePlus className="h-4 w-4" />
      </Button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute bottom-full left-0 mb-1 z-50 w-64 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                No quick replies
              </p>
            ) : (
              filtered.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    onSelect(r.content);
                    setOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  <span className="font-medium">{r.title}</span>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {r.content}
                  </p>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
