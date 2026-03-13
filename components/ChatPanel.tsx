"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { sendReply } from "@/lib/api";

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787";

interface Message {
  id: string;
  line_user_id: string;
  sender_type: "user" | "admin";
  content: string;
  timestamp: string;
}

interface ChatPanelProps {
  selectedUserId: string | null;
  token: string;
}

export function ChatPanel({ selectedUserId, token }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchMessages = async (silent = false) => {
    if (!selectedUserId) return;
    if (!silent) setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${WORKER_URL}/messages/${encodeURIComponent(selectedUserId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = await res.json();
      setMessages(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedUserId) {
      fetchMessages();
      inputRef.current?.focus();
    } else {
      setMessages([]);
    }
  }, [selectedUserId, token]);

  // Supabase Realtime: subscribe to new messages for this user
  useEffect(() => {
    if (!selectedUserId) return;
    const channel = supabase
      .channel(`messages-${selectedUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `line_user_id=eq.${selectedUserId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedUserId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !input.trim() || sending) return;
    const content = input.trim();
    setInput("");
    setSending(true);
    setError("");
    try {
      await sendReply(selectedUserId, content);
      // Realtime will push the new message; refetch to ensure we have it
      await fetchMessages(true);
    } catch (err) {
      setError((err as Error).message);
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  if (!selectedUserId) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center bg-slate-950 text-slate-500">
        <p>Select a conversation from the sidebar</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col bg-slate-950">
      <div className="border-b border-slate-800 px-4 py-3">
        <h3 className="font-medium text-white">
          User {selectedUserId.slice(-8)}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex justify-center py-8 text-slate-500">Loading...</div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender_type === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                    msg.sender_type === "user"
                      ? "rounded-br-md bg-[#06C755] text-white"
                      : "rounded-bl-md bg-slate-700 text-slate-100"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  <p
                    className={`mt-1 text-xs ${
                      msg.sender_type === "user"
                        ? "text-green-100/80"
                        : "text-slate-400"
                    }`}
                  >
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {error && (
        <div className="border-t border-slate-800 bg-red-900/20 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSend}
        className="flex gap-2 border-t border-slate-800 p-4"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-[#06C755] focus:outline-none focus:ring-1 focus:ring-[#06C755]"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="rounded-lg bg-[#06C755] px-6 py-2.5 font-medium text-white transition hover:bg-[#05b04a] disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </main>
  );
}
