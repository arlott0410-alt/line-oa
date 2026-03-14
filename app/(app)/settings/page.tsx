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
import { Plus, Pencil, Trash2, Search } from "lucide-react";

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      isSuperAdmin().then((ok) => {
        setAuthorized(ok);
        if (!ok) router.replace("/dashboard");
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
    } catch (err) {
      toast.error((err as Error).message);
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
    <div className="min-h-full p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Channel Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Add and manage Line Official Account channels. Webhook URL:{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              {typeof window !== "undefined"
                ? `${process.env.NEXT_PUBLIC_WORKER_URL || "YOUR_WORKER_URL"}/webhook`
                : "YOUR_WORKER_URL/webhook"}
            </code>
          </p>
        </div>

        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search channels..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <Button onClick={() => setAddOpen(true)} className="bg-[#06C755] hover:bg-[#05b04a]">
              <Plus className="mr-2 h-4 w-4" />
              Add Channel
            </Button>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Channel</DialogTitle>
              </DialogHeader>
              <ChannelForm
                onSubmit={handleAdd}
                onCancel={() => setAddOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              Loading...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Bot User ID</TableHead>
                  <TableHead className="w-[140px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((ch) => (
                  <TableRow key={ch.id}>
                    {editingId === ch.id ? (
                      <TableCell colSpan={3} className="p-4">
                        <div className="space-y-4">
                          <h3 className="font-medium">Edit Channel</h3>
                          <ChannelForm
                            channel={ch}
                            onSubmit={(data) => handleUpdate(ch.id, data)}
                            onCancel={() => setEditingId(null)}
                          />
                        </div>
                      </TableCell>
                    ) : (
                      <>
                        <TableCell className="font-medium">{ch.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {ch.bot_user_id}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setEditingId(ch.id)}
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
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Delete Channel</DialogTitle>
                                </DialogHeader>
                                <p className="text-sm text-muted-foreground">
                                  Delete {ch.name}? All related messages will be
                                  removed.
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
