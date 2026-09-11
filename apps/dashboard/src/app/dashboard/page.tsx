import { redirect } from 'next/navigation';
import { getSession } from '@/lib/guild';
import { ServerGrid } from '@/components/layout/server-selector';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { ServerCrash } from 'lucide-react';

export const metadata = { title: 'My servers' };
export const dynamic = 'force-dynamic';

export default async function DashboardIndexPage() {
  const session = await getSession();
  if (!session?.user) redirect('/auth/signin');

  const guilds = session.guilds ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <PageHeader
        title="My servers"
        description="Servers where you have Manage Server or Administrator permissions."
      />
      {guilds.length === 0 ? (
        <EmptyState
          icon={ServerCrash}
          title="No manageable servers yet"
          description="You need the Manage Server permission on a server (and Nexora must be in it) before it shows up here."
          action={{ label: 'Add Nexora to Discord', href: '/api/invite' }}
        />
      ) : (
        <ServerGrid guilds={guilds} />
      )}
      <div className="mt-8 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Can&apos;t see your server?</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            You need the <strong>Manage Server</strong> permission in that server (admins
            automatically qualify).
          </li>
          <li>
            Nexora must be a member of the server —{' '}
            <a href="/api/invite" className="text-primary underline-offset-4 hover:underline">
              invite it here
            </a>
            .
          </li>
          <li>
            We cache your server list for a few minutes — if you just got permissions, sign out and
            back in to refresh it.
          </li>
        </ul>
      </div>
    </div>
  );
}
