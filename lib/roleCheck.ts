/**
 * Re-export role check helpers (alias for auth.ts)
 */

export {
  getUserRole,
  isSuperAdmin,
  isAdminOrAbove,
  canManageChannels,
  canSendMessages,
  canViewChats,
  type UserRole,
} from "./auth";
