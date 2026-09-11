import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ADMIN_ROLE_VARIANT } from '@/lib/badges';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'No access' };

export const dynamic = 'force-dynamic';

/**
 * Shown when a signed-in staff member's role is not sufficient for the
 * requested page (route-level role gating — see lib/roles.ts PAGE_ROLES).
 */
export default async function NoAccessPage() {
  const session = await requireSession();
  const role = session.user.adminRole;
  if (!role) redirect('/access-denied');

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="rounded-xl border bg-card p-8 text-center shadow-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
            <Lock className="h-7 w-7" />
          </span>
          <h1 className="mt-5 text-xl font-semibold tracking-tight">Insufficient clearance</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Your staff role does not permit access to this area of the console.
            If you need it for your work, ask an OWNER to adjust your role under{' '}
            <span className="font-medium text-foreground">Staff</span>.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <span>Signed in as</span>
            <Badge variant={ADMIN_ROLE_VARIANT[role]}>{role}</Badge>
          </div>
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild variant="secondary">
              <Link href="/admin">
                <ArrowLeft />
                Back to overview
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
