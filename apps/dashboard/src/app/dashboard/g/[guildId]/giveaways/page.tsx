import { prisma } from '@nexora/database';
import { getGuildContext } from '@/lib/guild';
import { loadRoles, loadChannels } from '@/lib/guild-data';
import { PageHeader } from '@/components/shared/page-header';
import { GiveawaysList, type GiveawayView } from './giveaways-list';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Giveaways' };

export default async function GiveawaysPage({ params }: { params: { guildId: string } }) {
  const ctx = await getGuildContext(params.guildId);
  if (!ctx.ok) return null;
  const { guild, limits } = ctx;

  const [giveawayRows, roles, channels, runningCount] = await Promise.all([
    prisma.giveaway.findMany({
      where: { guildId: guild.id },
      orderBy: { endsAt: 'desc' },
      take: 50,
      include: { _count: { select: { entries: true } } },
    }),
    loadRoles(guild.id),
    loadChannels(guild.id),
    prisma.giveaway.count({ where: { guildId: guild.id, status: 'RUNNING' } }),
  ]);

  const giveaways: GiveawayView[] = giveawayRows.map((g) => ({
    id: g.id,
    prize: g.prize,
    channelId: g.channelId,
    winnerCount: g.winnerCount,
    // status is a string column — normalize into the view union.
    status: g.status === 'RUNNING' || g.status === 'CANCELLED' ? g.status : 'ENDED',
    endsAt: g.endsAt.toISOString(),
    entries: g._count.entries,
    rerollCount: g.rerollCount,
  }));

  return (
    <div>
      <PageHeader
        title="Giveaways"
        description="Create, monitor, end and reroll giveaways with entry requirements."
        breadcrumb={[{ label: guild.name, href: `/dashboard/g/${guild.id}` }, { label: 'Giveaways' }]}
      />
      <GiveawaysList
        guildId={guild.id}
        giveaways={giveaways}
        channels={channels}
        roles={roles}
        runningLimit={limits.giveaways}
        runningCount={runningCount}
      />
    </div>
  );
}
