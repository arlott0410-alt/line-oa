"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Users, Settings, LogOut, PanelLeftClose, PanelLeft } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/users", label: "Users", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

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
            LineUnifiedInbox
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
