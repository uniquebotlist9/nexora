import { prisma } from '@nexora/database';
import { getGuildContext } from '@/lib/guild';
import { PageHeader } from '@/components/shared/page-header';
import { RolesList, type RoleView } from './roles-list';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Roles' };

export default async function RolesPage({ params }: { params: { guildId: string } }) {
  const ctx = await getGuildContext(params.guildId);
  if (!ctx.ok) return null;
  const { guild } = ctx;

  // Roles synced by the bot + how often each appears in reaction-role panels.
  const [roles, panels] = await Promise.all([
    prisma.role.findMany({ where: { guildId: guild.id }, orderBy: { position: 'desc' } }),
    prisma.reactionRoleMessage.findMany({ where: { guildId: guild.id }, select: { options: true } }),
  ]);

  const usage = new Map<string, number>();
  for (const panel of panels) {
    const options = Array.isArray(panel.options) ? (panel.options as { roleId?: string }[]) : [];
    for (const opt of options) {
      if (opt.roleId) usage.set(opt.roleId, (usage.get(opt.roleId) ?? 0) + 1);
    }
  }

  const views: RoleView[] = roles.map((r) => ({
    id: r.id,
    name: r.name,
    position: r.position,
    color: r.color,
    isStaff: r.isStaff,
    reactionRoleUsage: usage.get(r.id) ?? 0,
  }));

  return (
    <div>
      <PageHeader
        title="Roles"
        description="Server roles as synced by the bot, with staff designations and role-menu usage."
        breadcrumb={[{ label: guild.name, href: `/dashboard/g/${guild.id}` }, { label: 'Roles' }]}
      />
      <RolesList guildId={guild.id} roles={views} />
    </div>
  );
}
