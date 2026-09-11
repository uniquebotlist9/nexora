import { prisma } from '@nexora/database';
import { Ticket, Clock, Star } from 'lucide-react';
import { getGuildContext } from '@/lib/guild';
import { loadRoles, loadChannels, parseJsonColumn } from '@/lib/guild-data';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { TicketConfigEditor } from './ticket-editor';
import type { TicketTypeInput } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tickets' };

export default async function TicketsPage({ params }: { params: { guildId: string } }) {
  const ctx = await getGuildContext(params.guildId);
  if (!ctx.ok) return null;
  const { guild, limits } = ctx;

  const [config, roles, channels, openCount, avgRating] = await Promise.all([
    prisma.ticketConfig.findUnique({ where: { guildId: guild.id } }),
    loadRoles(guild.id),
    loadChannels(guild.id),
    prisma.ticket.count({ where: { guildId: guild.id, status: { in: ['OPEN', 'CLAIMED'] } } }),
    prisma.ticketRating.aggregate({
      where: { ticket: { guildId: guild.id } },
      _avg: { stars: true },
    }),
  ]);

  // Compute average close time in minutes from createdAt → closedAt.
  const closed = await prisma.ticket.findMany({
    where: { guildId: guild.id, status: 'CLOSED', closedAt: { not: null } },
    select: { createdAt: true, closedAt: true },
    take: 200,
  });
  const avgClose =
    closed.length > 0
      ? closed.reduce((sum, t) => sum + (t.closedAt!.getTime() - t.createdAt.getTime()), 0) /
        closed.length /
        60_000
      : 0;

  const types = parseJsonColumn<TicketTypeInput[]>(config?.types, []);
  const staffRoleIds = config?.staffRoleIds ?? [];

  return (
    <div>
      <PageHeader
        title="Tickets"
        description="Support ticket panels, staff roles, transcripts and ratings."
        breadcrumb={[{ label: guild.name, href: `/dashboard/g/${guild.id}` }, { label: 'Tickets' }]}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Open tickets" value={openCount} icon={Ticket} />
        <StatCard
          label="Avg close time"
          value={closed.length > 0 ? `${Math.round(avgClose / 60)}h` : '—'}
          icon={Clock}
        />
        <StatCard
          label="Avg rating"
          value={avgRating._avg.stars ? `${avgRating._avg.stars.toFixed(1)}★` : '—'}
          icon={Star}
        />
      </div>

      <TicketConfigEditor
        guildId={guild.id}
        initial={{
          enabled: config?.enabled ?? false,
          channelId: config?.panelChannelId ?? undefined,
          transcriptChannelId: config?.transcriptChannelId ?? undefined,
          staffRoleIds,
          types,
          inactivityHours: config?.inactivityHours ?? 48,
          claimRequired: config?.claimRequired ?? false,
        }}
        roles={roles}
        channels={channels}
        initialBlacklist={config?.blacklist ?? []}
        panelDeployed={Boolean(config?.panelMessageId)}
        typeLimit={limits.ticketTypes}
      />
    </div>
  );
}
