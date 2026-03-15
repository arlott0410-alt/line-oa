"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { sendReply, uploadImage } from "@/lib/api";
import { QuickReplies } from "@/components/QuickReplies";
import { EscalationDialog } from "@/components/EscalationDialog";
import { ArrowUpCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { canSendMessages } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787";
const PAGE_SIZE = 50;

function EscalationTrigger({
  channelId,
  lineUserId,
  currentAdminId,
  onEscalated,
}: {
  channelId: string;
  lineUserId: string;
  currentAdminId: string;
  onEscalated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        title="ส่งแชทให้เพื่อน"
      >
        <ArrowUpCircle className="h-4 w-4" />
      </button>
      <EscalationDialog
        open={open}
        onOpenChange={setOpen}
        channelId={channelId}
        lineUserId={lineUserId}
        currentAdminId={currentAdminId}
        onEscalated={onEscalated}
      />
    </>
  );
}

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
  replied_by_display_name?: string | null;
}

interface ChatUserInfo {
  line_user_id: string;
  profile_name: string | null;
  avatar: string | null;
  channel_id?: string;
  assigned_admin_id?: string | null;
  assigned_admin_display_name?: string | null;
  viewed_by_admin_at?: string | null;
  last_message?: { content: string; timestamp: string; sender_type: string } | null;
}

interface ChatPanelProps {
  selectedUserId: string | null;
  selectedChannelId: string | null;
  selectedChannelName?: string | null;
  selectedChat: ChatUserInfo | null;
  token: string;
  onProfileUpdated?: (profileName: string) => void;
  /** Tags for filtering quick replies (e.g. from chat) */
  quickReplyTags?: string[];
  /** Current admin id for escalation */
  currentAdminId?: string | null;
  /** Current admin display name (for presence "who is viewing") */
  currentAdminDisplayName?: string | null;
  /** Call when chat is opened (mark viewed) */
  onMarkViewed?: (channelId: string, lineUserId: string) => void;
  /** Show escalation button */
  showEscalation?: boolean;
  /** Call when user resolves/closes a case */
  onResolve?: (channelId: string, lineUserId: string) => void;
  /** Call when user transfers chat to another admin — close tab */
  onEscalated?: (channelId: string, lineUserId: string) => void;
  /** ปิดแชทนี้ (ปุ่ม X ด้านขวาบน) */
  onClose?: () => void;
  /** เรียกหลังส่งข้อความสำเร็จ (ให้ refresh รายการแชทใน Sidebar) */
  onMessageSent?: () => void;
}

export function ChatPanel({
  selectedUserId,
  selectedChannelId,
  selectedChannelName,
  selectedChat,
  token,
  onProfileUpdated,
  quickReplyTags = [],
  currentAdminId,
  currentAdminDisplayName,
  onMarkViewed,
  showEscalation = false,
  onResolve,
  onEscalated,
  onClose,
  onMessageSent,
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
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [viewingNames, setViewingNames] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const offsetRef = useRef(0);
  offsetRef.current = offset;

  useEffect(() => {
    canSendMessages().then(setCanReply);
  }, []);

  // Presence: who else is viewing this chat (to avoid replying at the same time)
  useEffect(() => {
    if (!selectedChannelId || !selectedUserId || !currentAdminId) {
      setViewingNames([]);
      return;
    }
    const channelName = `viewing:${selectedChannelId}:${selectedUserId}`;
    const channel = supabase.channel(channelName);
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const names: string[] = [];
        const seen = new Set<string>();
        Object.values(state).forEach((presences) => {
          (presences as Array<{ user_id?: string; display_name?: string }>).forEach((p) => {
            if (p.user_id && p.user_id !== currentAdminId && !seen.has(p.user_id)) {
              seen.add(p.user_id);
              names.push(p.display_name || "ผู้ใช้");
            }
          });
        });
        setViewingNames(names);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: currentAdminId,
            display_name: currentAdminDisplayName || "ผู้ใช้",
          });
        }
      });
    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
      setViewingNames([]);
    };
  }, [selectedChannelId, selectedUserId, currentAdminId, currentAdminDisplayName]);

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
      onMarkViewed?.(selectedChannelId, selectedUserId);
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
          console.log("New message via realtime:", payload);
          const newMsg = payload.new as Message;
          if (newMsg.line_user_id === selectedUserId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" && err) toast.error("Realtime error: " + (err?.message ?? String(err)));
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedUserId, selectedChannelId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = input.trim();
    if ((!content && !pendingImage) || !selectedUserId || !selectedChannelId || sending || !canReply)
      return;
    setInput("");
    const imageToSend = pendingImage;
    setPendingImage(null);
    setSending(true);
    setError("");
    try {
      let imageUrl: string | undefined;
      if (imageToSend && selectedChannelId) {
        imageUrl = await uploadImage(selectedChannelId, imageToSend);
      }
      await sendReply(selectedChannelId, selectedUserId, content || "", imageUrl);
      await fetchMessages(true);
      onMessageSent?.();
    } catch (err) {
      setError((err as Error).message);
      setInput(content);
      if (imageToSend) setPendingImage(imageToSend);
    } finally {
      setSending(false);
    }
  };

  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  useEffect(() => {
    if (pendingImage) {
      const url = URL.createObjectURL(pendingImage);
      setPendingImagePreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setPendingImagePreview(null);
  }, [pendingImage]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("รองรับเฉพาะไฟล์ JPEG, PNG, GIF, WebP");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("รูปใหญ่เกิน 10MB");
      return;
    }
    setError("");
    setPendingImage(file);
    e.target.value = "";
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
    <main className="flex flex-1 flex-col min-h-0 bg-white">
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
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {selectedChannelName && (
            <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
              {selectedChannelName}
            </span>
          )}
          {selectedChat?.avatar ? (
            <img src={selectedChat.avatar} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
          ) : (
            <div className="h-9 w-9 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600 shrink-0">
              {(selectedChat?.profile_name || selectedUserId)?.slice(-2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-gray-900 truncate">
              {selectedChat?.profile_name || `User ${selectedUserId?.slice(-8) || ""}`}
            </h3>
            {selectedChat?.assigned_admin_id && (
              <p className="text-xs text-muted-foreground truncate" title="คนรับแชท">
                รับโดย: {selectedChat.assigned_admin_display_name || "—"}
              </p>
            )}
            {viewingNames.length > 0 && (
              <p className="text-[10px] text-emerald-600 truncate" title="กำลังดูหน้านี้อยู่">
                กำลังดูอยู่: {viewingNames.join(", ")}
              </p>
            )}
          </div>
        </div>
        {showEscalation && currentAdminId && selectedChannelId && selectedUserId && (
          <EscalationTrigger
            channelId={selectedChannelId}
            lineUserId={selectedUserId}
            currentAdminId={currentAdminId}
            onEscalated={onEscalated ? () => onEscalated(selectedChannelId, selectedUserId) : undefined}
          />
        )}
        {onResolve && showEscalation && currentAdminId && selectedChannelId && selectedUserId && selectedChat?.assigned_admin_id === currentAdminId && (
          <button
            type="button"
            onClick={async () => {
              const { error } = await supabase
                .from("line_users")
                .update({ queue_status: "resolved", assigned_admin_id: null })
                .eq("channel_id", selectedChannelId)
                .eq("line_user_id", selectedUserId);
              if (error) {
                toast.error(error.message);
                return;
              }
              toast.success("จบเคสแล้ว — แชทจะไปที่ เสร็จสิ้น");
              onResolve(selectedChannelId, selectedUserId);
            }}
            className="shrink-0 flex items-center gap-1.5 rounded bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
            title="จบเคส — ย้ายแชทไปที่เสร็จสิ้น"
          >
            <CheckCircle2 className="h-4 w-4" />
            จบเคส
          </button>
        )}
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
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title="ปิดแชท"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        )}
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
        className="flex-1 min-h-0 overflow-y-auto p-4"
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
            {messages.map((msg, idx) => {
              const isCustomer = msg.sender_type === "user";
              const lastUserMsgIndex = messages.map((m, i) => (m.sender_type === "user" ? i : -1)).filter((i) => i >= 0).pop();
              const isLastUserMessage = isCustomer && lastUserMsgIndex === idx;
              const viewedAt = selectedChat?.viewed_by_admin_at ? new Date(selectedChat.viewed_by_admin_at).getTime() : 0;
              const msgTime = new Date(msg.timestamp).getTime();
              const showRead = isLastUserMessage && viewedAt >= msgTime;
              return (
                <div
                  key={msg.id}
                  className={`flex ${isCustomer ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`flex max-w-[75%] flex-col gap-0.5 ${isCustomer ? "items-start" : "items-end"}`}
                  >
                    {!isCustomer && (
                      <span className="text-[10px] text-gray-500 px-1" title="ผู้ส่งข้อความ">
                        {msg.replied_by_display_name || "ทีมงาน"}
                      </span>
                    )}
                    <div
                      className={`rounded-2xl px-4 py-2 shadow-sm ${
                        isCustomer
                          ? "rounded-bl-md bg-gray-100 text-gray-900"
                          : "rounded-br-md bg-[#06C755] text-white"
                      }`}
                    >
                      {(msg.image_original_url || msg.image_preview_url) ? (
                        <button
                          type="button"
                          onClick={() =>
                            setImageModalUrl(msg.image_original_url || msg.image_preview_url || null)
                          }
                          className="block cursor-pointer"
                        >
                          <img
                            src={msg.image_original_url || msg.image_preview_url || ""}
                            alt="รูปภาพจากลูกค้า"
                            className="max-w-xs max-h-64 rounded-lg object-contain hover:opacity-90 transition"
                          />
                        </button>
                      ) : null}
                      {msg.content && msg.content !== "[Image]" ? (
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      ) : msg.content === "[Image]" && !msg.image_original_url && !msg.image_preview_url ? (
                        <p className="text-sm opacity-80">[รูปภาพ – กำลังโหลด]</p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0">
                        <span
                          className={`text-xs ${
                            isCustomer ? "text-muted-foreground" : "text-green-100/80"
                          }`}
                        >
                          {new Date(msg.timestamp).toLocaleTimeString("th-TH", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {showRead && (
                          <span className="text-[10px] text-muted-foreground">อ่านแล้ว</span>
                        )}
                      </div>
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
        <div className="shrink-0 border-t border-border bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {!canReply && (
        <div className="shrink-0 border-t border-gray-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          Viewer role: You cannot send messages.
        </div>
      )}

      <form
        onSubmit={handleSend}
        className="shrink-0 flex flex-col gap-2 border-t border-border bg-gray-50 p-3 sm:p-4"
      >
        {pendingImage && pendingImagePreview && (
          <div className="flex items-center gap-2">
            <img
              src={pendingImagePreview}
              alt="Preview"
              className="h-16 w-16 object-cover rounded-lg border"
            />
            <span className="text-sm text-muted-foreground truncate flex-1">{pendingImage.name}</span>
            <button
              type="button"
              onClick={() => setPendingImage(null)}
              className="text-red-500 hover:text-red-700 text-sm"
            >
              ลบ
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <QuickReplies
            onSelect={(content) => setInput((prev) => prev ? `${prev}\n${content}` : content)}
            filterTags={quickReplyTags}
            disabled={sending || !canReply}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleImageSelect}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || !canReply}
            className="shrink-0 p-2.5 rounded-full border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
            title="ส่งรูป"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
              <circle cx="9" cy="9" r="2"/>
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
            </svg>
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="พิมพ์ข้อความหรือส่งรูป..."
            rows={1}
            className="min-h-[44px] max-h-32 flex-1 resize-none rounded-2xl border border-gray-300 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-[#06C755]/30 focus:border-[#06C755] disabled:opacity-50 placeholder:text-gray-400"
            disabled={sending || !canReply}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(e as unknown as React.FormEvent);
              }
            }}
          />
          <Button
            type="submit"
            disabled={sending || (!input.trim() && !pendingImage) || !canReply}
            className="shrink-0 rounded-full h-11 w-11 p-0 bg-[#06C755] hover:bg-[#05b04a]"
            title="ส่ง"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
          </Button>
        </div>
      </form>
    </main>
  );
}
