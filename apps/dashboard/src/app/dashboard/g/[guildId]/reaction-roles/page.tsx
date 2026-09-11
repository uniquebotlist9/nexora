import { prisma } from '@nexora/database';
import { getGuildContext } from '@/lib/guild';
import { loadRoles, loadChannels, parseJsonColumn } from '@/lib/guild-data';
import { PageHeader } from '@/components/shared/page-header';
import { ReactionRolesList, type PanelView } from './reaction-roles-list';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reaction Roles' };

export default async function ReactionRolesPage({ params }: { params: { guildId: string } }) {
  const ctx = await getGuildContext(params.guildId);
  if (!ctx.ok) return null;
  const { guild, limits } = ctx;

  const [panels, roles, channels] = await Promise.all([
    prisma.reactionRoleMessage.findMany({
      where: { guildId: guild.id },
      orderBy: { createdAt: 'desc' },
    }),
    loadRoles(guild.id),
    loadChannels(guild.id),
  ]);

  const views: PanelView[] = panels.map((p) => ({
    id: p.id,
    channelId: p.channelId,
    title: p.title,
    style: p.style,
    options: parseJsonColumn<PanelView['options']>(p.options, []),
    singleChoice: p.singleChoice,
    deployed: !p.messageId.startsWith('pending-'),
  }));

  return (
    <div>
      <PageHeader
        title="Reaction Roles"
        description="Self-service role menus with buttons, dropdowns or reactions."
        breadcrumb={[{ label: guild.name, href: `/dashboard/g/${guild.id}` }, { label: 'Reaction Roles' }]}
      />
      <ReactionRolesList
        guildId={guild.id}
        panels={views}
        channels={channels}
        roles={roles}
        panelLimit={limits.reactionRoleMessages}
      />
    </div>
  );
}
