import { prisma } from '@nexora/database';
import { getGuildContext } from '@/lib/guild';
import { loadRoles, loadChannels } from '@/lib/guild-data';
import { PageHeader } from '@/components/shared/page-header';
import { AntiRaidEditor, type AntiRaidState } from './anti-raid-editor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Anti-Raid' };

export default async function AntiRaidPage({ params }: { params: { guildId: string } }) {
  const ctx = await getGuildContext(params.guildId);
  if (!ctx.ok) return null;
  const { guild } = ctx;

  const [config, roles, channels] = await Promise.all([
    prisma.antiRaidConfig.findUnique({ where: { guildId: guild.id } }),
    loadRoles(guild.id),
    loadChannels(guild.id),
  ]);

  const initial: AntiRaidState = {
    enabled: config?.enabled ?? true,
    joinThreshold: config?.joinThreshold ?? 10,
    windowSeconds: config?.windowSeconds ?? 60,
    minAccountAgeHours: config?.minAccountAgeHours ?? 72,
    action: config?.action ?? 'ALERT_MODS',
    quarantineRoleId: config?.quarantineRoleId ?? null,
    quarantineEnabled: config?.quarantineEnabled ?? false,
    verificationMode: config?.verificationMode ?? false,
    autoLockdown: config?.autoLockdown ?? false,
    lockdownActive: config?.lockdownActive ?? false,
    autoRecover: config?.autoRecover ?? true,
    alertChannelId: config?.alertChannelId ?? null,
    lastRaidAt: config?.lastRaidAt ?? null,
  };

  return (
    <div>
      <PageHeader
        title="Anti-Raid"
        description="Join-velocity detection, quarantine, lockdown and auto-recovery."
        breadcrumb={[{ label: guild.name, href: `/dashboard/g/${guild.id}` }, { label: 'Anti-Raid' }]}
      />
      <AntiRaidEditor guildId={guild.id} initial={initial} roles={roles} channels={channels} />
    </div>
  );
}
