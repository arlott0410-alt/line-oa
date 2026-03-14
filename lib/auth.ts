/**
 * Role-based access helpers for LineUnifiedInbox
 */

import { supabase } from "./supabase";

export type UserRole = "super_admin" | "admin" | "viewer";

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
