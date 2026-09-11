import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import type { Session } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ADMIN_ROLE_RANK, canAccessPage, type AdminRole, type PageKey } from '@/lib/roles';

/** Current session (or null), enriched with the live AdminUser role. */
export async function getSession(): Promise<Session | null> {
  return getServerSession(authOptions);
}

/** Session or redirect to the sign-in page. Used by the panel layout. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
  // Signed in via Discord but no longer in the AdminUser table (removed while
  // a session was open) — treat as denied, not anonymous.
  if (!session.user.adminRole) {
    redirect('/access-denied');
  }
  return session;
}

/** Rank check: `hasSessionRank(session, 'DEVELOPER')` is true for DEVELOPER and above. */
export function hasSessionRank(session: Session | null, minRole: AdminRole): boolean {
  const role = session?.user?.adminRole ?? null;
  if (!role) return false;
  return ADMIN_ROLE_RANK[role] >= ADMIN_ROLE_RANK[minRole];
}

/**
 * Page-level access. Redirects to /login without a session, /no-access when
 * the role lacks the page, and returns the session when allowed.
 */
export async function requirePage(page: PageKey): Promise<Session> {
  const session = await requireSession();
  if (!canAccessPage(session.user.adminRole, page)) {
    redirect('/no-access');
  }
  return session;
}
