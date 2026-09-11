import { prisma } from '@nexora/database';
import { getGuildContext } from '@/lib/guild';
import { loadRoles, parseJsonColumn } from '@/lib/guild-data';
import { PageHeader } from '@/components/shared/page-header';
import { CommandsView, type CustomCommandView } from './commands-view';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Commands' };

export default async function CommandsPage({ params }: { params: { guildId: string } }) {
  const ctx = await getGuildContext(params.guildId);
  if (!ctx.ok) return null;
  const { guild, limits } = ctx;

  const [commandRows, roles] = await Promise.all([
    prisma.customCommand.findMany({
      where: { guildId: guild.id },
      orderBy: { createdAt: 'asc' },
    }),
    loadRoles(guild.id),
  ]);

  const commands: CustomCommandView[] = commandRows.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    response: parseJsonColumn<CustomCommandView['response']>(c.response, {}),
    cooldownSeconds: c.cooldownSeconds,
    requiredRoleIds: c.requiredRoleIds,
    enabled: c.enabled,
    usageCount: c.usageCount,
  }));

  return (
    <div>
      <PageHeader
        title="Commands"
        description="Custom slash commands plus the core command registry reference."
        breadcrumb={[{ label: guild.name, href: `/dashboard/g/${guild.id}` }, { label: 'Commands' }]}
      />
      <CommandsView guildId={guild.id} commands={commands} roles={roles} limit={limits.customCommands} />
    </div>
  );
}
