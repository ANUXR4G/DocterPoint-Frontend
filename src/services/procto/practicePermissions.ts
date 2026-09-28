import type { PracticeMemberRole } from "@prisma/client";

/**
 * Practice-level permissions. Every clinic login carries the same global token scopes,
 * so what a member may do inside a clinic comes from their membership role here.
 */
export const PRACTICE_PERMISSIONS = ["MANAGE_SLOTS_INLINE"] as const;
export type PracticePermission = (typeof PRACTICE_PERMISSIONS)[number];

/** Whose calendar a permission covers: every doctor's, or only the member's own. */
export type PermissionScope = "ANY" | "OWN";

const ROLE_PERMISSIONS: Record<PracticeMemberRole, Partial<Record<PracticePermission, PermissionScope>>> = {
  PRACTICE_OWNER: { MANAGE_SLOTS_INLINE: "ANY" },
  PRACTICE_ADMIN: { MANAGE_SLOTS_INLINE: "ANY" },
  RECEPTIONIST: { MANAGE_SLOTS_INLINE: "ANY" },
  DOCTOR: { MANAGE_SLOTS_INLINE: "OWN" },
};

export function permissionScope(
  role: PracticeMemberRole | string,
  permission: PracticePermission,
): PermissionScope | null {
  return ROLE_PERMISSIONS[role as PracticeMemberRole]?.[permission] ?? null;
}

export function permissionsFor(role: PracticeMemberRole | string): Record<PracticePermission, PermissionScope | null> {
  return Object.fromEntries(
    PRACTICE_PERMISSIONS.map((p) => [p, permissionScope(role, p)]),
  ) as Record<PracticePermission, PermissionScope | null>;
}

/** `null` when allowed, otherwise the reason it isn't. */
export function deniedFor(
  role: PracticeMemberRole | string,
  permission: PracticePermission,
  actorUserId: string,
  providerId: string,
): string | null {
  const scope = permissionScope(role, permission);
  if (!scope) return `Your clinic role can't do this (needs ${permission}).`;
  if (scope === "OWN" && actorUserId !== providerId) {
    return "You can only change your own calendar. Reception and clinic admins can do it for any doctor.";
  }
  return null;
}
