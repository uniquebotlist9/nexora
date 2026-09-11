import { prisma } from '@nexora/database';
import { getGuildContext } from '@/lib/guild';
import { loadRoles, loadChannels, parseJsonColumn } from '@/lib/guild-data';
import { PageHeader } from '@/components/shared/page-header';
import { LevelingEditor } from './leveling-editor';
import type { LevelConfigInput } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Leveling' };

export default async function LevelingPage({ params }: { params: { guildId: string } }) {
  const ctx = await getGuildContext(params.guildId);
  if (!ctx.ok) return null;
  const { guild } = ctx;

  const [config, roles, channels] = await Promise.all([
    prisma.levelConfig.findUnique({ where: { guildId: guild.id } }),
    loadRoles(guild.id),
    loadChannels(guild.id),
  ]);

  const initial: LevelConfigInput = {
    enabled: config?.enabled ?? true,
    xpMin: config?.xpMin ?? 10,
    xpMax: config?.xpMax ?? 25,
    cooldownSeconds: config?.cooldownSeconds ?? 60,
    multipliers: parseJsonColumn<LevelConfigInput['multipliers']>(config?.multipliers, []),
    ignoreChannelIds: config?.ignoreChannelIds ?? [],
    announceChannelId: config?.announceChannelId ?? null,
    announceTemplate: config?.announceTemplate ?? 'GG {user}, you reached level {level}!',
    dmEnabled: config?.dmEnabled ?? false,
    dmTemplate: config?.dmTemplate ?? 'You reached level {level} in {server}!',
    roleRewards: parseJsonColumn<LevelConfigInput['roleRewards']>(config?.roleRewards, []),
  };

  return (
    <div>
      <PageHeader
        title="Leveling"
        description="XP, cooldowns, role multipliers, level-up announcements and role rewards."
        breadcrumb={[{ label: guild.name, href: `/dashboard/g/${guild.id}` }, { label: 'Leveling' }]}
      />
      <LevelingEditor guildId={guild.id} initial={initial} roles={roles} channels={channels} />
    </div>
  );
}
