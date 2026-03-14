"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isSuperAdmin } from "@/lib/auth";
import { ChannelForm, type Channel } from "@/components/ChannelForm";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Search, Copy, ExternalLink, CheckCircle2, Radio } from "lucide-react";

const WEBHOOK_BASE = (
  process.env.NEXT_PUBLIC_WORKER_URL || "https://line-oa-worker.arlott0410.workers.dev"
).replace(/\/$/, "");
const WEBHOOK_URL = `${WEBHOOK_BASE}/webhook`;

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
  const [addOpen, setAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [webhookModalOpen, setWebhookModalOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      isSuperAdmin().then((ok) => {
        setAuthorized(ok);
        if (!ok) {
          toast.error("Access denied. Super Admin only.");
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

  const filtered = channels.filter(
    (ch) =>
      ch.name.toLowerCase().includes(search.toLowerCase()) ||
      ch.bot_user_id.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = async (formData: {
    name: string;
    access_token: string;
    secret: string;
    bot_user_id: string;
  }) => {
    try {
      const { error } = await supabase.from("channels").insert({
        name: formData.name,
        access_token: formData.access_token,
        secret: formData.secret,
        bot_user_id: formData.bot_user_id,
      });
      if (error) throw new Error(error.message);
      toast.success("Channel added!");
      setAddOpen(false);
      fetchChannels();
      setWebhookModalOpen(true);
    } catch (err) {
      toast.error((err as Error).message);
    }
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
    try {
      const updateData: Record<string, string> = { name: formData.name };
      if (formData.access_token && formData.access_token !== "KEEP_EXISTING") {
        updateData.access_token = formData.access_token;
      }
      if (formData.secret && formData.secret !== "KEEP_EXISTING") {
        updateData.secret = formData.secret;
      }
      const { error } = await supabase
        .from("channels")
        .update(updateData)
        .eq("id", id);
      if (error) throw new Error(error.message);
      toast.success("Channel updated!");
      setEditingId(null);
      fetchChannels();
      setWebhookModalOpen(true);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleCopyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(WEBHOOK_URL);
      toast.success("Copied!");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("channels").delete().eq("id", id);
      if (error) throw new Error(error.message);
      toast.success("Channel deleted");
      setEditingId(null);
      setDeleteOpen(null);
      fetchChannels();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (authorized === false || authorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-6 lg:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Channel Settings
          </h1>
          <p className="mt-1.5 text-sm text-gray-500">
            Add and manage Line Official Account channels
          </p>
        </div>

        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-[#06C755]/10 p-2">
              <Radio className="h-5 w-5 text-[#06C755]" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-gray-900">Webhook URL</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Use this URL in LINE Developers Console → Messaging API for all channels
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 truncate rounded-md bg-gray-50 px-3 py-2 text-xs font-medium text-gray-800">
                  {WEBHOOK_URL}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyWebhook}
                  className="shrink-0"
                >
                  <Copy className="mr-1.5 h-4 w-4" />
                  Copy
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search channels..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 sm:w-64"
            />
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <Button onClick={() => setAddOpen(true)} className="bg-[#06C755] hover:bg-[#05b04a]">
              <Plus className="mr-2 h-4 w-4" />
              Add Channel
            </Button>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-lg">Add Channel</DialogTitle>
              </DialogHeader>
              <ChannelForm
                onSubmit={handleAdd}
                onCancel={() => setAddOpen(false)}
              />
            </DialogContent>
          </Dialog>

          <Dialog open={webhookModalOpen} onOpenChange={setWebhookModalOpen}>
            <DialogContent className="sm:max-w-lg">
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-[#06C755]/10 p-2.5">
                  <CheckCircle2 className="h-6 w-6 text-[#06C755]" />
                </div>
                <div className="flex-1 min-w-0">
                  <DialogHeader>
                    <DialogTitle className="text-lg">Channel Saved Successfully</DialogTitle>
                  </DialogHeader>
                  <p className="mt-2 text-sm text-gray-600">
                    Copy the Webhook URL below and paste it into your Line OA&apos;s Messaging API settings in LINE Developers Console. The same URL is used for all channels.
                  </p>
                  <div className="mt-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                    <code className="flex-1 truncate text-sm font-medium text-gray-800">
                      {WEBHOOK_URL}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyWebhook}
                      className="shrink-0"
                    >
                      <Copy className="mr-1.5 h-4 w-4" />
                      Copy
                    </Button>
                  </div>
                  <DialogFooter className="mt-6 gap-2 sm:gap-0">
                    <a
                      href="https://developers.line.biz/console/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <ExternalLink className="mr-1.5 h-4 w-4" />
                      LINE Console
                    </a>
                    <Button onClick={() => setWebhookModalOpen(false)} className="bg-[#06C755] hover:bg-[#05b04a]">
                      Done
                    </Button>
                  </DialogFooter>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16 text-gray-500">
              <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#06C755] border-t-transparent" />
                <span className="text-sm">Loading channels...</span>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-gray-100 p-4">
                <Radio className="h-8 w-8 text-gray-400" />
              </div>
              <p className="mt-4 text-sm font-medium text-gray-900">
                {channels.length === 0 ? "No channels yet" : "No channels match your search"}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {channels.length === 0 ? "Add your first Line OA to start receiving messages" : "Try a different search term"}
              </p>
              {channels.length === 0 && (
                <Button
                  onClick={() => setAddOpen(true)}
                  className="mt-4 bg-[#06C755] hover:bg-[#05b04a]"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Channel
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-gray-200 bg-gray-50/80 hover:bg-transparent">
                  <TableHead className="font-semibold text-gray-900">Name</TableHead>
                  <TableHead className="font-semibold text-gray-900">Bot User ID</TableHead>
                  <TableHead className="w-[120px] font-semibold text-gray-900 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((ch) => (
                  <TableRow key={ch.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                    {editingId === ch.id ? (
                      <TableCell colSpan={3} className="bg-gray-50/50 p-6">
                        <div className="space-y-4">
                          <h3 className="text-sm font-semibold text-gray-900">Edit Channel</h3>
                          <ChannelForm
                            channel={ch}
                            onSubmit={(data) => handleUpdate(ch.id, data)}
                            onCancel={() => setEditingId(null)}
                          />
                        </div>
                      </TableCell>
                    ) : (
                      <>
                        <TableCell className="font-medium text-gray-900">{ch.name}</TableCell>
                        <TableCell className="font-mono text-sm text-gray-600">
                          {ch.bot_user_id}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setEditingId(ch.id)}
                              className="text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Dialog
                              open={deleteOpen === ch.id}
                              onOpenChange={(o) =>
                                o ? setDeleteOpen(ch.id) : setDeleteOpen(null)
                              }
                            >
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setDeleteOpen(ch.id)}
                                className="text-gray-500 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Delete Channel</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-gray-600">
                  Delete <strong>{ch.name}</strong>? All related messages and data will be permanently removed.
                </p>
                                <DialogFooter>
                                  <Button
                                    variant="outline"
                                    onClick={() => setDeleteOpen(null)}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    onClick={() => handleDelete(ch.id)}
                                  >
                                    Delete
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
