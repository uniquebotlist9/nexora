import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  ADMIN_ROLE_RANK,
  hasAnyRole,
  type AdminRole,
} from '@/lib/roles';

export type GuardResult = { session: Session } | { error: string };

/**
 * Auth + role guard for server actions. Verified against the live session on
 * every call — any client-side RoleGate is purely cosmetic.
 *
 * Supports two gate shapes (mirroring requireAdmin):
 *  - `guardAction({ minRank: 'DEVELOPER' })` — linear rank gate
 *  - `guardAction({ roles: [...] })` — explicit allow-list, for the
 *    non-linear parts of the hierarchy (e.g. SUPPORT has subscription rights
 *    that DEVELOPER lacks).
 */
export async function guardAction(
  requirement: { minRank: AdminRole } | { roles: readonly AdminRole[] },
): Promise<GuardResult> {
  const session = await getServerSession(authOptions);
  const role = session?.user?.adminRole ?? null;

  if (!session || !role) {
    return { error: 'Not authenticated.' };
  }

  const ok =
    'roles' in requirement
      ? hasAnyRole(role, requirement.roles)
      : ADMIN_ROLE_RANK[role] >= ADMIN_ROLE_RANK[requirement.minRank];

  if (!ok) {
    const requirementLabel =
      'roles' in requirement ? requirement.roles.join(' / ') : requirement.minRank;
    return { error: `This action requires ${requirementLabel} clearance.` };
  }
  return { session };
}
