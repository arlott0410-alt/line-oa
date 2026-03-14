"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getUserRole, type UserRole } from "@/lib/auth";
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
import { LayoutDashboard, Users, Settings, LogOut, PanelLeftClose, PanelLeft, ListTodo, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ALL_NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["super_admin", "admin", "viewer"] as UserRole[] },
  { href: "/queue", label: "คิวรอรับ", icon: ListTodo, roles: ["super_admin", "admin"] as UserRole[] },
  { href: "/users", label: "Users", icon: Users, roles: ["super_admin"] as UserRole[] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["super_admin"] as UserRole[] },
];

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [role, setRole] = useState<UserRole | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      getUserRole().then(setRole);
      const uid = (session as { user?: { id: string } }).user?.id;
      if (uid) {
        const { data } = await supabase.from("admin_profiles").select("display_name").eq("user_id", uid).single();
        setDisplayName(data?.display_name || "");
      }
    });
  }, []);

  const handleSaveDisplayName = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("admin_profiles").upsert(
      { user_id: user.id, display_name: editNameValue.trim() || null, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDisplayName(editNameValue.trim() || "");
    setEditNameOpen(false);
    toast.success("บันทึกชื่อแล้ว");
  };

  const navItems = role
    ? ALL_NAV_ITEMS.filter((item) => item.roles.includes(role))
    : ALL_NAV_ITEMS.filter((item) => item.href === "/dashboard");

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border bg-white shadow-sm transition-all duration-200",
        collapsed ? "w-16" : "w-56"
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-border px-3">
        {!collapsed && (
          <Link href="/dashboard" className="font-semibold text-gray-800">
            OKACE Line OA
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start font-medium transition-colors",
                  collapsed && "justify-center px-0",
                  isActive
                    ? "bg-[#06C755] text-white hover:bg-[#05b04a] hover:text-white"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", !collapsed && "mr-2")} />
                {!collapsed && item.label}
              </Button>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-2">
        {role && !collapsed && (
          <div className="space-y-1 px-3 py-1">
            <div className="flex items-center gap-1 text-xs">
              <span className="text-gray-500">ชื่อ:</span>
              <span className="font-medium text-gray-700">{displayName || "—"}</span>
              <button
                type="button"
                onClick={() => {
                  setEditNameValue(displayName);
                  setEditNameOpen(true);
                }}
                className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                title="แก้ไขชื่อที่แสดง"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>
            <div className="text-xs text-gray-500">
              Role: <span className="font-medium text-gray-700">{role.replace("_", " ")}</span>
            </div>
          </div>
        )}
        <Dialog open={editNameOpen} onOpenChange={setEditNameOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>ตั้งชื่อที่แสดง</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">ให้พนักงานรู้ว่าใครรับงานอยู่</p>
            <div className="py-2">
              <Label>ชื่อ</Label>
              <Input
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                placeholder="เช่น สมชาย, แมว"
                className="mt-1"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditNameOpen(false)}>ยกเลิก</Button>
              <Button onClick={handleSaveDisplayName} disabled={saving}>
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button
          variant="ghost"
          className={cn("w-full justify-start text-gray-600 hover:bg-gray-100 hover:text-gray-900", collapsed && "justify-center px-0")}
          onClick={async () => {
            await supabase.auth.signOut();
            router.replace("/login");
          }}
        >
          <LogOut className={cn("h-4 w-4", !collapsed && "mr-2")} />
          {!collapsed && "Logout"}
        </Button>
      </div>
    </aside>
  );
}
