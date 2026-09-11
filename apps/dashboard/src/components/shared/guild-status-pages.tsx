import { ShieldX, SearchX } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/shared/logo';

/** Rendered when the session has no manager/admin access to this guild. */
export function ForbiddenPage({ guildName }: { guildName?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
        <ShieldX className="h-8 w-8 text-destructive" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <p className="font-mono text-sm text-muted-foreground">403</p>
        <h1 className="text-2xl font-bold">Access denied</h1>
        <p className="max-w-md text-muted-foreground">
          You need the <strong>Manage Server</strong> permission
          {guildName ? ` on ${guildName}` : ' on this server'} to open its dashboard. Ask an
          administrator to grant it, or switch to a server you manage.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/dashboard"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-ring"
        >
          My servers
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted focus-ring"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}

/** Rendered when the guild (or Nexora's presence in it) can't be found. */
export function GuildNotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <SearchX className="h-8 w-8 text-primary" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="text-2xl font-bold">Server not found</h1>
        <p className="max-w-md text-muted-foreground">
          Nexora doesn&apos;t know this server yet — it may have left, or the dashboard hasn&apos;t
          synced it. Re-invite the bot to get started.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/api/invite"
          className="rounded-lg bg-gradient-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 focus-ring"
        >
          Add Nexora
        </Link>
        <Link
          href="/dashboard"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted focus-ring"
        >
          My servers
        </Link>
      </div>
    </div>
  );
}
