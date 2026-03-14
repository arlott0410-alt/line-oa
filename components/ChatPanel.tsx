"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { sendReply } from "@/lib/api";
import { toast } from "sonner";
import { canSendMessages } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787";
const PAGE_SIZE = 50;

interface Message {
  id: string;
  line_user_id: string;
  sender_type: "user" | "admin";
  content: string;
  timestamp: string;
  channel_id?: string;
  image_original_url?: string | null;
  image_preview_url?: string | null;
  mime_type?: string | null;
}

interface ChatUserInfo {
  line_user_id: string;
  profile_name: string | null;
  avatar: string | null;
  channel_id?: string;
}

interface ChatPanelProps {
  selectedUserId: string | null;
  selectedChannelId: string | null;
  selectedChat: ChatUserInfo | null;
  token: string;
  onProfileUpdated?: (profileName: string) => void;
}

export function ChatPanel({
  selectedUserId,
  selectedChannelId,
  selectedChat,
  token,
  onProfileUpdated,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [canReply, setCanReply] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const offsetRef = useRef(0);
  offsetRef.current = offset;

  useEffect(() => {
    canSendMessages().then(setCanReply);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchMessages = useCallback(
    async (silent = false, loadOffset = 0) => {
      if (!selectedUserId || !selectedChannelId) return;
      if (loadOffset === 0 && !silent) setLoading(true);
      if (loadOffset > 0) setLoadingMore(true);
      setError("");
      try {
        const res = await fetch(
          `${WORKER_URL}/messages/${encodeURIComponent(selectedUserId)}?channel_id=${encodeURIComponent(selectedChannelId)}&limit=${PAGE_SIZE}&offset=${loadOffset}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error("Failed to fetch messages");
        const data = await res.json();
        if (loadOffset === 0) {
          setMessages(data);
          setOffset(data.length);
          setHasMore(data.length === PAGE_SIZE);
        } else {
          setMessages((prev) => [...data, ...prev]);
          setOffset((o) => o + data.length);
          setHasMore(data.length === PAGE_SIZE);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        if (loadOffset === 0 && !silent) setLoading(false);
        if (loadOffset > 0) setLoadingMore(false);
      }
    },
    [selectedUserId, selectedChannelId, token]
  );

  useEffect(() => {
    if (selectedUserId && selectedChannelId) {
      setOffset(0);
      setHasMore(true);
      fetchMessages();
      inputRef.current?.focus();
    } else {
      setMessages([]);
    }
  }, [selectedUserId, selectedChannelId, token]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loadingMore || !hasMore) return;
    if (el.scrollTop < 100) {
      fetchMessages(true, offsetRef.current);
    }
  }, [loadingMore, hasMore, fetchMessages]);

  useEffect(() => {
    if (!selectedUserId || !selectedChannelId) return;
    const channel = supabase
      .channel(`messages-${selectedChannelId}-${selectedUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${selectedChannelId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.line_user_id === selectedUserId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedUserId, selectedChannelId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !selectedChannelId || !input.trim() || sending || !canReply)
      return;
    const content = input.trim();
    setInput("");
    setSending(true);
    setError("");
    try {
      await sendReply(selectedChannelId, selectedUserId, content);
      await fetchMessages(true);
    } catch (err) {
      setError((err as Error).message);
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  if (!selectedChannelId) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center bg-gray-50 text-gray-500">
        <p>Select a channel from the dropdown</p>
      </main>
    );
  }

  if (!selectedUserId) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center bg-gray-50 text-gray-500">
        <p>Select a conversation from the sidebar</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col bg-white">
      <Dialog open={!!imageModalUrl} onOpenChange={() => setImageModalUrl(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          {imageModalUrl && (
            <img
              src={imageModalUrl}
              alt="Full size"
              className="w-full h-auto max-h-[90vh] object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

      <div className="border-b border-gray-200 bg-white px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {selectedChat?.avatar ? (
            <img src={selectedChat.avatar} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
          ) : (
            <div className="h-9 w-9 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600 shrink-0">
              {(selectedChat?.profile_name || selectedUserId)?.slice(-2).toUpperCase()}
            </div>
          )}
          <h3 className="font-medium text-gray-900 truncate">
            {selectedChat?.profile_name || `User ${selectedUserId?.slice(-8) || ""}`}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditNameValue(selectedChat?.profile_name || "");
            setEditNameOpen(true);
          }}
          className="shrink-0 p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          title="แก้ไขชื่อ"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        </button>
      </div>
      <Dialog open={editNameOpen} onOpenChange={setEditNameOpen}>
        <DialogContent className="sm:max-w-md">
          <h4 className="font-medium">แก้ไขชื่อลูกค้า</h4>
          <input
            type="text"
            value={editNameValue}
            onChange={(e) => setEditNameValue(e.target.value)}
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2"
            placeholder="ชื่อลูกค้า"
          />
          <div className="flex gap-2 mt-4 justify-end">
            <Button variant="outline" onClick={() => setEditNameOpen(false)}>ยกเลิก</Button>
            <Button
              className="bg-[#06C755] hover:bg-[#05b04a]"
              onClick={async () => {
                if (!selectedChannelId || !selectedUserId || editNameValue.trim() === selectedChat?.profile_name) {
                  setEditNameOpen(false);
                  return;
                }
                const { error } = await supabase
                  .from("line_users")
                  .update({ profile_name: editNameValue.trim() })
                  .eq("channel_id", selectedChannelId)
                  .eq("line_user_id", selectedUserId);
                if (error) {
                  toast.error(error.message);
                  return;
                }
                toast.success("บันทึกแล้ว");
                onProfileUpdated?.(editNameValue.trim());
                setEditNameOpen(false);
              }}
            >
              บันทึก
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4"
      >
        {loading ? (
          <div className="flex justify-center py-8 text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-3">
            {loadingMore && (
              <div className="flex justify-center py-2 text-sm text-muted-foreground">
                Loading older messages...
              </div>
            )}
            {messages.map((msg) => {
              const isCustomer = msg.sender_type === "user";
              return (
                <div
                  key={msg.id}
                  className={`flex ${isCustomer ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`flex max-w-[75%] gap-2 ${isCustomer ? "flex-row" : "flex-row-reverse"}`}
                  >
                    <div
                      className={`rounded-2xl px-4 py-2 shadow-sm ${
                        isCustomer
                          ? "rounded-bl-md bg-gray-100 text-gray-900"
                          : "rounded-br-md bg-[#06C755] text-white"
                      }`}
                    >
                      {msg.image_preview_url ? (
                        <button
                          type="button"
                          onClick={() =>
                            setImageModalUrl(msg.image_original_url || msg.image_preview_url || null)
                          }
                          className="block cursor-pointer"
                        >
                          <img
                            src={msg.image_preview_url}
                            alt="รูปภาพจากลูกค้า"
                            className="max-w-xs max-h-64 rounded-lg object-contain hover:opacity-90 transition"
                          />
                        </button>
                      ) : null}
                      {msg.content && msg.content !== "[Image]" ? (
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      ) : msg.content === "[Image]" && !msg.image_preview_url ? (
                        <p className="text-sm opacity-80">[รูปภาพ – กำลังโหลด]</p>
                      ) : null}
                      <p
                        className={`mt-1 text-xs ${
                          isCustomer ? "text-muted-foreground" : "text-green-100/80"
                        }`}
                      >
                        {new Date(msg.timestamp).toLocaleTimeString("th-TH", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {error && (
        <div className="border-t border-border bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {!canReply && (
        <div className="border-t border-gray-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          Viewer role: You cannot send messages.
        </div>
      )}

      <form
        onSubmit={handleSend}
        className="flex gap-2 border-t border-border p-4"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          disabled={sending || !canReply}
        />
        <Button
          type="submit"
          disabled={sending || !input.trim() || !canReply}
          className="bg-[#06C755] hover:bg-[#05b04a]"
        >
          Send
        </Button>
      </form>
    </main>
  );
}
