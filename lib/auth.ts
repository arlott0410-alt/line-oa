/**
 * Role-based access helpers for LineUnifiedInbox
 *
 * Roles (3 total):
 * - super_admin: Users, Settings, Dashboard, send messages
 * - admin: Dashboard, send messages
 * - viewer: Dashboard, read-only
 */

import { supabase } from "./supabase";

export type UserRole = "super_admin" | "admin" | "viewer";

/** หน้าไหนให้ role ไหนเข้าได้ */
export const ROLE_PAGE_ACCESS: Record<UserRole, string[]> = {
  super_admin: ["/dashboard", "/users", "/settings"],
  admin: ["/dashboard"],
  viewer: ["/dashboard"],
};

export async function getUserRole(): Promise<UserRole | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data) return null;
    return data.role as UserRole;
  } catch {
    return null;
  }
}

export async function isSuperAdmin(): Promise<boolean> {
  const role = await getUserRole();
  return role === "super_admin";
}

export async function isAdminOrAbove(): Promise<boolean> {
  const role = await getUserRole();
  return role === "super_admin" || role === "admin";
}

export async function canManageChannels(): Promise<boolean> {
  return isSuperAdmin();
}

export async function canSendMessages(): Promise<boolean> {
  return isAdminOrAbove();
}

export async function canViewChats(): Promise<boolean> {
  const role = await getUserRole();
  return role === "super_admin" || role === "admin" || role === "viewer";
}
