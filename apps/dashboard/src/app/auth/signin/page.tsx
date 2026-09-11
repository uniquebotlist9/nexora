import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { getInviteUrl, hasDiscordCredentials } from '@/lib/discord';
import { Logo } from '@/components/shared/logo';
import { DiscordSigninButton } from '@/components/auth/discord-signin-button';

export const metadata = { title: 'Sign in' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string };
}) {
  const session = await getServerSession();
  if (session) redirect(searchParams.callbackUrl ?? '/dashboard');

  const credentialsConfigured = hasDiscordCredentials();
  const callbackUrl = searchParams.callbackUrl ?? '/dashboard';

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <div className="pointer-events-none absolute inset-0 bg-hero-glow" aria-hidden="true" />
      <div className="relative flex w-full max-w-sm flex-col items-center gap-8">
        <Logo />
        <div className="glass w-full rounded-2xl p-8 text-center shadow-xl">
          <h1 className="text-xl font-bold">Welcome back</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Sign in with Discord to manage your servers.
          </p>
          <div className="mt-6">
            <DiscordSigninButton
              callbackUrl={callbackUrl}
              disabled={!credentialsConfigured}
            />
          </div>
          {!credentialsConfigured && (
            <p className="mt-4 rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-500" role="alert">
              Discord sign-in is not configured on this deployment yet. Ask the operator to set
              DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET.
            </p>
          )}
          <p className="mt-6 text-xs text-muted-foreground">
            By continuing you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
        <a
          href={getInviteUrl()}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Just want to add the bot? Invite Nexora →
        </a>
      </div>
    </div>
  );
}
