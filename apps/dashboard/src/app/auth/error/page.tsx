import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Logo } from '@/components/shared/logo';
import { DiscordSigninButton } from '@/components/auth/discord-signin-button';

export const metadata = { title: 'Sign-in error' };

const ERROR_EXPLANATIONS: Record<string, string> = {
  OAuthSignin: 'Starting the Discord sign-in flow failed. Please try again.',
  OAuthCallback: 'Discord rejected the sign-in. Your session may have expired — try again.',
  OAuthCreateAccount: 'We could not create your account from the Discord profile.',
  EmailCreateAccount: 'We could not create your account.',
  Callback: 'The sign-in callback failed. This is usually a misconfigured redirect URL.',
  OAuthAccountNotLinked:
    'This Discord account is not linked to an existing profile. Contact support if this persists.',
  Default: 'Sign-in failed. Please try again in a moment.',
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const message =
    (searchParams.error && ERROR_EXPLANATIONS[searchParams.error]) ?? ERROR_EXPLANATIONS.Default;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <div className="pointer-events-none absolute inset-0 bg-hero-glow" aria-hidden="true" />
      <div className="relative flex w-full max-w-sm flex-col items-center gap-6">
        <Logo />
        <div className="glass w-full rounded-2xl p-8 text-center shadow-xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
            <AlertTriangle className="h-6 w-6 text-amber-500" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-xl font-bold">Sign-in failed</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{message}</p>
          {searchParams.error && (
            <p className="mt-2 font-mono text-xs text-muted-foreground/70">
              code: {searchParams.error}
            </p>
          )}
          <div className="mt-6">
            <DiscordSigninButton callbackUrl="/dashboard" />
          </div>
          <Link
            href="/"
            className="mt-4 inline-block text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
