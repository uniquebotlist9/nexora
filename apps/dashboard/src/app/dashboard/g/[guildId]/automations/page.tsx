import { prisma } from '@nexora/database';
import { getGuildContext } from '@/lib/guild';
import { loadRoles, loadChannels, parseJsonColumn } from '@/lib/guild-data';
import { PageHeader } from '@/components/shared/page-header';
import { AutomationsList, type AutomationView } from './automations-list';
import type { AutomationActionInput } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Automations' };

export default async function AutomationsPage({ params }: { params: { guildId: string } }) {
  const ctx = await getGuildContext(params.guildId);
  if (!ctx.ok) return null;
  const { guild, limits } = ctx;

  const [rows, roles, channels] = await Promise.all([
    prisma.automation.findMany({
      where: { guildId: guild.id },
      orderBy: { createdAt: 'asc' },
    }),
    loadRoles(guild.id),
    loadChannels(guild.id),
  ]);

  const automations: AutomationView[] = rows.map((a) => ({
    id: a.id,
    name: a.name,
    enabled: a.enabled,
    triggerType: a.trigger,
    triggerCount: a.triggerCount,
    actions: parseJsonColumn<AutomationActionInput[]>(a.actions, []),
  }));

  return (
    <div>
      <PageHeader
        title="Automations"
        description="If-This-Then-That workflows: triggers, chained actions, scheduled runs."
        breadcrumb={[{ label: guild.name, href: `/dashboard/g/${guild.id}` }, { label: 'Automations' }]}
      />
      <AutomationsList
        guildId={guild.id}
        automations={automations}
        channels={channels}
        roles={roles}
        limit={limits.automations}
      />
    </div>
  );
}
