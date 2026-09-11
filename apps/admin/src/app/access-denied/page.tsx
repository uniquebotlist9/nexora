import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Access denied' };

/**
 * Shown when Discord sign-in is denied: the Discord account has no AdminUser
 * row. Sign-in is rejected outright — no rows are ever created implicitly.
 */
export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="rounded-xl border bg-card p-8 text-center shadow-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
            <ShieldAlert className="h-7 w-7" />
          </span>
          <h1 className="mt-5 text-xl font-semibold tracking-tight">Access denied</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Your Discord account is not registered as Nexora staff. Sign-in is
            restricted to accounts listed in the staff directory.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            If you believe you should have access, ask an existing OWNER to add
            your Discord user ID under <span className="font-medium text-foreground">Staff</span>.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild variant="secondary">
              <Link href="/login">
                <ArrowLeft />
                Back to sign in
              </Link>
            </Button>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Only the first OWNER is seeded manually; all other staff are managed
          through the console.
        </p>
      </div>
    </main>
  );
}
