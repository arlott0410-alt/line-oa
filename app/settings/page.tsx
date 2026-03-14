"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { isSuperAdmin } from "@/lib/auth";
import { ChannelForm, type Channel } from "@/components/ChannelForm";

interface ChannelRow extends Channel {
  access_token?: string;
  secret?: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      isSuperAdmin().then((ok) => {
        setAuthorized(ok);
        if (!ok) {
          router.replace("/dashboard");
        }
      });
    });
  }, [router]);

  const fetchChannels = async () => {
    const { data, error } = await supabase
      .from("channels")
      .select("id, name, bot_user_id, created_at")
      .order("created_at", { ascending: false });
    if (!error) setChannels(data || []);
  };

  useEffect(() => {
    if (authorized) fetchChannels();
  }, [authorized]);

  useEffect(() => {
    if (!authorized) return;
    setLoading(false);
  }, [authorized]);

  const handleAdd = async (formData: {
    name: string;
    access_token: string;
    secret: string;
    bot_user_id: string;
  }) => {
    const { error } = await supabase.from("channels").insert({
      name: formData.name,
      access_token: formData.access_token,
      secret: formData.secret,
      bot_user_id: formData.bot_user_id,
    });
    if (error) throw new Error(error.message);
    setShowAddForm(false);
    fetchChannels();
  };

  const handleUpdate = async (
    id: string,
    formData: {
      name: string;
      access_token: string;
      secret: string;
      bot_user_id: string;
    }
  ) => {
    const updateData: Record<string, string> = { name: formData.name };
    if (formData.access_token && formData.access_token !== "KEEP_EXISTING") {
      updateData.access_token = formData.access_token;
    }
    if (formData.secret && formData.secret !== "KEEP_EXISTING") {
      updateData.secret = formData.secret;
    }
    const { error } = await supabase.from("channels").update(updateData).eq("id", id);
    if (error) throw new Error(error.message);
    setEditingId(null);
    fetchChannels();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this channel? All related messages will be removed.")) return;
    const { error } = await supabase.from("channels").delete().eq("id", id);
    if (error) throw new Error(error.message);
    setEditingId(null);
    fetchChannels();
  };

  if (authorized === false || authorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="text-slate-400 hover:text-white"
          >
            ← Dashboard
          </Link>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.replace("/login");
            }}
            className="text-slate-400 hover:text-white"
          >
            Logout
          </button>
        </div>

        <h1 className="mb-6 text-2xl font-bold text-white">Channel Settings</h1>
        <p className="mb-6 text-slate-400">
          Add and manage Line Official Account channels. Webhook URL:{" "}
          <code className="rounded bg-slate-800 px-1 py-0.5">
            {typeof window !== "undefined"
              ? `${process.env.NEXT_PUBLIC_WORKER_URL || "YOUR_WORKER_URL"}/webhook`
              : "YOUR_WORKER_URL/webhook"}
          </code>
        </p>

        {showAddForm ? (
          <div className="mb-8 rounded-lg border border-slate-700 bg-slate-900/50 p-6">
            <h2 className="mb-4 text-lg font-medium text-white">Add Channel</h2>
            <ChannelForm
              onSubmit={handleAdd}
              onCancel={() => setShowAddForm(false)}
            />
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="mb-6 rounded-lg bg-[#06C755] px-4 py-2 text-white hover:bg-[#05b04a]"
          >
            + Add Channel
          </button>
        )}

        <div className="space-y-4">
          {channels.map((ch) => (
            <div
              key={ch.id}
              className="rounded-lg border border-slate-700 bg-slate-900/50 p-6"
            >
              {editingId === ch.id ? (
                <>
                  <h2 className="mb-4 text-lg font-medium text-white">Edit Channel</h2>
                  <ChannelForm
                    channel={ch}
                    onSubmit={(data) => handleUpdate(ch.id, data)}
                    onCancel={() => setEditingId(null)}
                  />
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-white">{ch.name}</h3>
                    <p className="text-sm text-slate-500">Bot ID: {ch.bot_user_id}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingId(ch.id)}
                      className="rounded px-3 py-1 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(ch.id)}
                      className="rounded px-3 py-1 text-sm text-red-400 hover:bg-slate-800"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
