import { prisma } from '@nexora/database';
import { getSession } from '@/lib/guild';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { AuthProvider } from '@/components/layout/auth-provider';
import { ForbiddenPage, GuildNotFoundPage } from '@/components/shared/guild-status-pages';
import { getGuildContext } from '@/lib/guild';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function GuildLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { guildId: string };
}) {
  const session = await getSession();
  if (!session?.user) redirect('/auth/signin');

  const ctx = await getGuildContext(params.guildId);
  if (!ctx.ok) {
    if (ctx.reason === 'forbidden') return <ForbiddenPage />;
    if (ctx.reason === 'notfound') return <GuildNotFoundPage />;
    redirect('/auth/signin');
  }

  // Recent dashboard activity for the notifications popover (AuditLog feed).
  let notifications: { id: string; action: string; actorType: string; createdAt: string }[] = [];
  try {
    const logs = await prisma.auditLog.findMany({
      where: { guildId: params.guildId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, action: true, actorType: true, createdAt: true },
    });
    notifications = logs.map((l) => ({
      id: l.id,
      action: l.action,
      actorType: l.actorType,
      createdAt: l.createdAt.toISOString(),
    }));
  } catch {
    // Activity feed is non-critical — empty is fine.
  }

  return (
    <AuthProvider>
      <DashboardShell
        guildId={params.guildId}
        guilds={ctx.guilds}
        notifications={notifications}
        user={{ name: session.user?.name, email: session.user?.email, image: session.user?.image }}
      >
        {children}
      </DashboardShell>
    </AuthProvider>
  );
}
