import { redirect } from 'next/navigation';
import type { Session } from 'next-auth';
import { requireSession } from '@/lib/session';
import {
  ADMIN_ROLE_RANK,
  hasAnyRole,
  type AdminRole,
} from '@/lib/roles';

/**
 * Server-component gate: the caller must hold one of `roles` (an explicit
 * allow-list) or a rank of at least `minRank`. Redirects to /no-access when
 * the requirement is not met — call BEFORE any prisma access so pages never
 * touch data they should not see.
 *
 * Use `requireAdmin({ minRank: 'DEVELOPER' })` for linear rank gates and
 * `requireAdmin({ roles: [...] })` where the hierarchy is non-linear
 * (e.g. subscription management includes SUPPORT but not DEVELOPER).
 */
export async function requireAdmin(
  requirement: { minRank: AdminRole } | { roles: readonly AdminRole[] },
): Promise<Session> {
  const session = await requireSession();
  const role = session.user.adminRole;

  const ok =
    'roles' in requirement
      ? hasAnyRole(role, requirement.roles)
      : role !== null && ADMIN_ROLE_RANK[role] >= ADMIN_ROLE_RANK[requirement.minRank];

  if (!ok) {
    redirect('/no-access');
  }
  return session;
}
