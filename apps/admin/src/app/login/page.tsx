import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AlertTriangle, Bot, ShieldCheck } from 'lucide-react';
import { SignInButton } from '@/app/login/signin-button';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Sign in' };

export const dynamic = 'force-dynamic';

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized:
    'You are not authorized to access the staff console. Ask an OWNER to add your Discord account under Staff.',
  AccessDenied: 'Sign-in denied. Your Discord account is not on the staff list.',
  Configuration:
    'Authentication is not configured. Set DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET / AUTH_SECRET_ADMIN in the repo root .env.',
  OAuthSignin: 'Failed to start Discord sign-in. Please try again.',
  OAuthCallback: 'Discord sign-in failed. Please try again.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const session = await getSession();
  if (session?.user?.adminRole) {
    redirect('/admin');
  }

  const rawError = searchParams?.error;
  const errorCode = Array.isArray(rawError) ? rawError[0] : rawError;
  const errorMessage = errorCode
    ? ERROR_MESSAGES[errorCode] ?? 'Sign-in failed. Please try again.'
    : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border bg-card p-8 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Bot className="h-7 w-7" />
            </span>
            <h1 className="mt-5 text-xl font-semibold tracking-tight">Nexora Staff Console</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Internal administration for the Nexora platform.
            </p>
          </div>

          {errorMessage ? (
            <div
              role="alert"
              className="mt-6 flex gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          ) : null}

          <div className="mt-6">
            <SignInButton />
          </div>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Access restricted to accounts in the AdminUser table.
          </p>
        </div>
      </div>
    </main>
  );
}
