import { prisma } from '@nexora/database';
import { Bot } from 'lucide-react';
import { getGuildContext } from '@/lib/guild';
import { loadRoles, loadChannels, parseJsonColumn } from '@/lib/guild-data';
import { PageHeader } from '@/components/shared/page-header';
import { AutoModRules, type AutoModRuleView } from './rule-editor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AutoMod' };

export default async function AutoModPage({ params }: { params: { guildId: string } }) {
  const ctx = await getGuildContext(params.guildId);
  if (!ctx.ok) return null;
  const { guild, limits } = ctx;

  const [ruleRows, roles, channels] = await Promise.all([
    prisma.autoModRule.findMany({
      where: { guildId: guild.id },
      orderBy: { createdAt: 'asc' },
    }),
    loadRoles(guild.id),
    loadChannels(guild.id),
  ]);

  const rules: AutoModRuleView[] = ruleRows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    enabled: r.enabled,
    trigger: parseJsonColumn<Record<string, unknown>>(r.trigger, {}),
    actions: parseJsonColumn<AutoModRuleView['actions']>(r.actions, [{ type: 'DELETE' }]),
    exemptRoleIds: r.exemptRoleIds,
    exemptChannelIds: r.exemptChannelIds,
    strikeCount: r.strikeCount,
  }));

  return (
    <div>
      <PageHeader
        title="AutoMod"
        description="Automatic message and join filtering with per-rule triggers, actions and exemptions."
        breadcrumb={[{ label: guild.name, href: `/dashboard/g/${guild.id}` }, { label: 'AutoMod' }]}
      />
      <AutoModRules
        guildId={guild.id}
        rules={rules}
        roles={roles}
        channels={channels}
        limit={limits.autoModRules}
        ruleCount={rules.length}
      />
    </div>
  );
}
