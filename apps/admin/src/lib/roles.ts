/**
 * Staff role model for the admin console.
 *
 * The canonical role list, ranking, and validators live in `@nexora/types`
 * (MongoDB stores roles as plain strings — never import enums from
 * `@prisma/client`). This module layers the admin console's route/mutation
 * access matrix on top of that hierarchy.
 *
 * The hierarchy is intentionally non-linear (SUPPORT and MODERATOR share rank
 * 40, and DEVELOPER at 60 lacks subscription rights that SUPPORT at 40 has),
 * so page access is expressed as explicit role sets derived from rank
 * thresholds where that is correct.
 */
import {
  ADMIN_ROLES,
  ADMIN_ROLE_RANK,
  isAdminRole,
  type AdminRole,
} from '@nexora/types';

export type { AdminRole };
export { ADMIN_ROLES, ADMIN_ROLE_RANK, isAdminRole };

/** Every role whose rank is at least `minRole`'s rank. */
export function rolesWithRankAtLeast(minRole: AdminRole): readonly AdminRole[] {
  return ADMIN_ROLES.filter((r) => ADMIN_ROLE_RANK[r] >= ADMIN_ROLE_RANK[minRole]);
}

export function roleRank(role: AdminRole | null | undefined): number {
  if (!role || !isAdminRole(role)) return 0;
  return ADMIN_ROLE_RANK[role];
}

/** Pure rank check usable from both server and client components. */
export function hasRank(
  role: AdminRole | null | undefined,
  minRole: AdminRole,
): boolean {
  return roleRank(role) >= ADMIN_ROLE_RANK[minRole];
}

/** Explicit allow-list check (for non-linear gates). */
export function hasAnyRole(
  role: AdminRole | null | undefined,
  allowed: readonly AdminRole[],
): boolean {
  return role !== null && role !== undefined && allowed.includes(role);
}

// ---------------------------------------------------------------------------
// Route-level access matrix (sidebar visibility + server-side page gating)
// ---------------------------------------------------------------------------

export type PageKey =
  | 'overview'
  | 'guilds'
  | 'users'
  | 'staff'
  | 'subscriptions'
  | 'moderation'
  | 'system'
  | 'feedback'
  | 'analytics'
  | 'audit';

/**
 * Explicit per-page allow-lists.
 *
 *  - overview / analytics / audit: every staff role (ANALYST is read-only).
 *  - guilds: OWNER, ADMINISTRATOR, SUPPORT, MODERATOR.
 *  - users: guild roles + DEVELOPER (API keys / system-facing user data).
 *  - staff: OWNER + ADMINISTRATOR may view; mutations are OWNER-only
 *    (see STAFF_MUTATION_ROLES).
 *  - subscriptions: OWNER, ADMINISTRATOR, SUPPORT (SUPPORT owns subscription
 *    management per the role charter; DEVELOPER/MODERATOR do not).
 *  - moderation: rank >= MODERATOR (SUPPORT shares rank 40 and is included).
 *  - system: rank >= DEVELOPER.
 *  - feedback: SUPPORT owns feedback triage (plus ADMIN+ and DEVELOPER).
 */
export const PAGE_ROLES: Record<PageKey, readonly AdminRole[]> = {
  overview: ADMIN_ROLES,
  guilds: ['OWNER', 'ADMINISTRATOR', 'SUPPORT', 'MODERATOR'],
  users: ['OWNER', 'ADMINISTRATOR', 'SUPPORT', 'MODERATOR', 'DEVELOPER'],
  staff: ['OWNER', 'ADMINISTRATOR'],
  subscriptions: ['OWNER', 'ADMINISTRATOR', 'SUPPORT'],
  moderation: rolesWithRankAtLeast('MODERATOR'),
  system: rolesWithRankAtLeast('DEVELOPER'),
  feedback: ['OWNER', 'ADMINISTRATOR', 'SUPPORT', 'DEVELOPER'],
  analytics: ADMIN_ROLES,
  audit: ADMIN_ROLES,
};

export function canAccessPage(
  role: AdminRole | null | undefined,
  page: PageKey,
): boolean {
  return hasAnyRole(role, PAGE_ROLES[page]);
}

// ---------------------------------------------------------------------------
// Mutation-level gates (enforced server-side in every server action)
// ---------------------------------------------------------------------------

/** Staff management mutations: OWNER only. */
export const STAFF_MUTATION_ROLES: readonly AdminRole[] = ['OWNER'];

/** Guild danger zone (disable/enable a guild): OWNER + ADMINISTRATOR. */
export const GUILD_DANGER_ROLES: readonly AdminRole[] = ['OWNER', 'ADMINISTRATOR'];

/** Subscription grant/cancel/reassign: OWNER, ADMINISTRATOR, SUPPORT. */
export const SUBSCRIPTION_MUTATION_ROLES: readonly AdminRole[] = [
  'OWNER',
  'ADMINISTRATOR',
  'SUPPORT',
];

/** System operations (webhook requeue/disable, task force-complete, API key revoke): DEVELOPER+. */
export const SYSTEM_OPS_ROLES: readonly AdminRole[] = rolesWithRankAtLeast('DEVELOPER');

/** Roles allowed to see billing data (plan badges, subscription tables). */
export const BILLING_READ_ROLES: readonly AdminRole[] = [
  ...SUBSCRIPTION_MUTATION_ROLES,
  'ANALYST',
];

export function canViewBilling(role: AdminRole | null | undefined): boolean {
  return hasAnyRole(role, BILLING_READ_ROLES);
}

/** ANALYST is strictly read-only: never allowed to perform any mutation. */
export function canMutate(role: AdminRole | null | undefined): boolean {
  return role !== null && role !== undefined && role !== 'ANALYST';
}
