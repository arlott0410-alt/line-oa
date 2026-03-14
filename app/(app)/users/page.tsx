"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isSuperAdmin } from "@/lib/auth";
import {
  fetchAdminUsers,
  createAdminUser,
  updateAdminUserRole,
  updateAdminUserPassword,
  deleteAdminUser,
  fetchAdminMetrics,
  type AdminUser,
  type AdminMetrics,
} from "@/lib/api";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Search, Plus, Pencil, Trash2, KeyRound } from "lucide-react";

const ROLES = ["super_admin", "admin", "viewer"] as const;
const SKILLS = ["deposit", "withdrawal", "general"] as const;
const STATUSES = ["available", "busy", "offline"] as const;

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [metrics, setMetrics] = useState<AdminMetrics>({});
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState<string | null>(null);
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addRole, setAddRole] = useState<string>("admin");
  const [addDisplayName, setAddDisplayName] = useState("");
  const [editRole, setEditRole] = useState<string>("admin");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editSkills, setEditSkills] = useState<string[]>([]);
  const [editStatus, setEditStatus] = useState<string>("offline");
  const [submitting, setSubmitting] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

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

  const fetchUsers = async () => {
    try {
      const data = await fetchAdminUsers();
      setUsers(data);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authorized) fetchUsers();
  }, [authorized]);

  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.role.toLowerCase().includes(search.toLowerCase()) ||
      (u.display_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addEmail || !addPassword || !addRole) return;
    setSubmitting(true);
    try {
      const created = await createAdminUser(addEmail, addPassword, addRole);
      const uid = created?.id;
      if (uid && addDisplayName.trim()) {
        await supabase.from("admin_profiles").upsert(
          { user_id: uid, display_name: addDisplayName.trim(), updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      }
      toast.success("User created successfully");
      setAddOpen(false);
      setAddEmail("");
      setAddPassword("");
      setAddRole("admin");
      setAddDisplayName("");
      fetchUsers();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (uid: string) => {
    setSubmitting(true);
    try {
      await updateAdminUserRole(uid, editRole);
      await supabase.from("admin_profiles").upsert(
        { user_id: uid, display_name: editDisplayName.trim() || null, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
      if (["admin", "super_admin"].includes(editRole)) {
        await supabase.from("admin_status").upsert(
          { user_id: uid, status: editStatus, last_updated: new Date().toISOString() },
          { onConflict: "user_id" }
        );
        const { data: existing } = await supabase.from("admin_skills").select("id").eq("user_id", uid);
        if (existing) await supabase.from("admin_skills").delete().eq("user_id", uid);
        if (editSkills.length > 0) {
          await supabase.from("admin_skills").insert(
            editSkills.map((skill) => ({ user_id: uid, skill }))
          );
        }
      }
      toast.success("User updated");
      setEditOpen(null);
      fetchUsers();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangePassword = async (uid: string) => {
    if (!newPassword || newPassword.length < 6) {
      toast.error("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }
    if (newPassword !== passwordConfirm) {
      toast.error("รหัสผ่านไม่ตรงกัน");
      return;
    }
    setSubmitting(true);
    try {
      await updateAdminUserPassword(uid, newPassword);
      toast.success("เปลี่ยนรหัสผ่านสำเร็จ");
      setPasswordOpen(null);
      setNewPassword("");
      setPasswordConfirm("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const loadEditData = async (uid: string) => {
    setEditOpen(uid);
    const u = users.find((x) => x.id === uid);
    if (u) {
      setEditRole(u.role);
      setEditDisplayName(u.display_name || "");
    }
    if (u && ["admin", "super_admin"].includes(u.role)) {
      const { data: skills } = await supabase.from("admin_skills").select("skill").eq("user_id", uid);
      setEditSkills(skills?.map((s) => s.skill) || []);
      const { data: status } = await supabase.from("admin_status").select("status").eq("user_id", uid).single();
      setEditStatus(status?.status || "offline");
    } else {
      setEditSkills([]);
      setEditStatus("offline");
    }
  };

  const handleDelete = async (uid: string) => {
    setSubmitting(true);
    try {
      await deleteAdminUser(uid);
      toast.success("User deleted");
      setDeleteOpen(null);
      fetchUsers();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
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
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">User Management</h1>
            <p className="text-sm text-muted-foreground">
              Add and manage users with role-based access
            </p>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <Button onClick={() => setAddOpen(true)} className="bg-[#06C755] hover:bg-[#05b04a]">
              <Plus className="mr-2 h-4 w-4" />
              Add User
            </Button>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add User</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4">
                <div>
                  <Label htmlFor="add-email">Email</Label>
                  <Input
                    id="add-email"
                    type="email"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    placeholder="user@example.com"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="add-display-name">ชื่อที่แสดง</Label>
                  <Input
                    id="add-display-name"
                    value={addDisplayName}
                    onChange={(e) => setAddDisplayName(e.target.value)}
                    placeholder="เช่น สมชาย, แมว"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    ให้พนักงานรู้ว่าใครรับงานอยู่
                  </p>
                </div>
                <div>
                  <Label htmlFor="add-password">Password</Label>
                  <Input
                    id="add-password"
                    type="password"
                    value={addPassword}
                    onChange={(e) => setAddPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>
                <div>
                  <Label htmlFor="add-role">Role</Label>
                  <select
                    id="add-role"
                    value={addRole}
                    onChange={(e) => setAddRole(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAddOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Creating..." : "Create"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหาตาม email, ชื่อ หรือ role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
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
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Resolved</TableHead>
                  <TableHead>Avg response</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Sign In</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => {
                  const m = metrics[u.id];
                  return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.display_name || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {u.role}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {m?.resolved_chats ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {m?.avg_response_time_seconds != null
                        ? `${m.avg_response_time_seconds}s`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {u.created_at
                        ? new Date(u.created_at).toLocaleDateString()
                        : "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {u.last_sign_in_at
                        ? new Date(u.last_sign_in_at).toLocaleDateString()
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Dialog
                          open={editOpen === u.id}
                          onOpenChange={(o) =>
                            o ? setEditOpen(u.id) : setEditOpen(null)
                          }
                        >
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => loadEditData(u.id)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Edit Role</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <p className="text-sm text-muted-foreground">
                                {u.email}
                              </p>
                              <div>
                                <Label>ชื่อที่แสดง</Label>
                                <Input
                                  value={editDisplayName}
                                  onChange={(e) => setEditDisplayName(e.target.value)}
                                  placeholder="เช่น สมชาย, แมว"
                                  className="mt-1"
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                  ให้พนักงานรู้ว่าใครรับงานอยู่
                                </p>
                              </div>
                              <div>
                                <Label>Role</Label>
                                <select
                                  value={editRole}
                                  onChange={(e) => {
                                    setEditRole(e.target.value);
                                    if (!["admin", "super_admin"].includes(e.target.value)) {
                                      setEditSkills([]);
                                      setEditStatus("offline");
                                    }
                                  }}
                                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                                >
                                  {ROLES.map((r) => (
                                    <option key={r} value={r}>
                                      {r}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              {["admin", "super_admin"].includes(editRole) && (
                                <>
                                  <div>
                                    <Label>Status (for queue assignment)</Label>
                                    <select
                                      value={editStatus}
                                      onChange={(e) => setEditStatus(e.target.value)}
                                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                                    >
                                      {STATUSES.map((s) => (
                                        <option key={s} value={s}>
                                          {s}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <Label>Skills (for skill-based routing)</Label>
                                    <div className="mt-1 flex flex-wrap gap-2">
                                      {SKILLS.map((s) => (
                                        <label key={s} className="flex items-center gap-1 text-sm">
                                          <input
                                            type="checkbox"
                                            checked={editSkills.includes(s)}
                                            onChange={(e) =>
                                              setEditSkills((prev) =>
                                                e.target.checked ? [...prev, s] : prev.filter((x) => x !== s)
                                              )
                                            }
                                          />
                                          {s}
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                </>
                              )}
                              <div className="pt-2 border-t">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setPasswordOpen(u.id);
                                    setNewPassword("");
                                    setPasswordConfirm("");
                                  }}
                                  className="gap-2"
                                >
                                  <KeyRound className="h-4 w-4" />
                                  เปลี่ยนรหัสผ่าน
                                </Button>
                              </div>
                            </div>
                            <DialogFooter>
                              <Button
                                variant="outline"
                                onClick={() => setEditOpen(null)}
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={() => handleEdit(u.id)}
                                disabled={submitting}
                              >
                                {submitting ? "Saving..." : "Save"}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                        <Dialog
                          open={passwordOpen === u.id}
                          onOpenChange={(o) =>
                            o ? setPasswordOpen(u.id) : setPasswordOpen(null)
                          }
                        >
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>เปลี่ยนรหัสผ่าน</DialogTitle>
                            </DialogHeader>
                            <p className="text-sm text-muted-foreground">
                              เปลี่ยนรหัสผ่านสำหรับ {u.email}
                            </p>
                            <div className="space-y-4">
                              <div>
                                <Label>รหัสผ่านใหม่</Label>
                                <Input
                                  type="password"
                                  value={newPassword}
                                  onChange={(e) => setNewPassword(e.target.value)}
                                  placeholder="อย่างน้อย 6 ตัวอักษร"
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label>ยืนยันรหัสผ่าน</Label>
                                <Input
                                  type="password"
                                  value={passwordConfirm}
                                  onChange={(e) => setPasswordConfirm(e.target.value)}
                                  placeholder="ใส่รหัสผ่านอีกครั้ง"
                                  className="mt-1"
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button
                                variant="outline"
                                onClick={() => setPasswordOpen(null)}
                              >
                                ยกเลิก
                              </Button>
                              <Button
                                onClick={() => handleChangePassword(u.id)}
                                disabled={submitting}
                              >
                                {submitting ? "กำลังเปลี่ยน..." : "เปลี่ยนรหัสผ่าน"}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                        <Dialog
                          open={deleteOpen === u.id}
                          onOpenChange={(o) =>
                            o ? setDeleteOpen(u.id) : setDeleteOpen(null)
                          }
                        >
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteOpen(u.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Delete User</DialogTitle>
                            </DialogHeader>
                            <p className="text-sm text-muted-foreground">
                              Are you sure you want to delete {u.email}? This
                              cannot be undone.
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
                                onClick={() => handleDelete(u.id)}
                                disabled={submitting}
                              >
                                {submitting ? "Deleting..." : "Delete"}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TableCell>
                  </TableRow>
                );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
