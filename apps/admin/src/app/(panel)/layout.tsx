import type { Metadata } from 'next';
import { AppShell } from '@/components/layout/app-shell';
import { AppSessionProvider } from '@/components/providers/session-provider';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = {
  title: { default: 'Overview', template: '%s · Nexora Staff Console' },
};

/**
 * Panel shell: every route inside this group requires a signed-in staff
 * member with a live AdminUser role.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const role = session.user.adminRole ?? 'SUPPORT';

  return (
    <AppSessionProvider session={session}>
      <AppShell
        user={{
          id: session.user.id,
          name: session.user.name ?? null,
          email: session.user.email ?? null,
          image: session.user.image ?? null,
          role,
        }}
      >
        {children}
      </AppShell>
    </AppSessionProvider>
  );
}
