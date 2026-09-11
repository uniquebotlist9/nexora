import { prisma } from '@nexora/database';
import { getGuildContext } from '@/lib/guild';
import { guildPath } from '@/lib/nav';
import { PageHeader } from '@/components/shared/page-header';
import { SettingsView, type ModuleStatus } from './settings-view';
import { intToHex } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

export default async function SettingsPage({ params }: { params: { guildId: string } }) {
  const ctx = await getGuildContext(params.guildId);
  if (!ctx.ok) return null;
  const { guild } = ctx;

  const [settings, welcome, ticket, level, economy, verification, antiRaid, logConfig] =
    await Promise.all([
      prisma.guildSettings.findUnique({ where: { guildId: guild.id } }),
      prisma.welcomeConfig.findUnique({ where: { guildId: guild.id }, select: { welcomeEnabled: true } }),
      prisma.ticketConfig.findUnique({ where: { guildId: guild.id }, select: { enabled: true } }),
      prisma.levelConfig.findUnique({ where: { guildId: guild.id }, select: { enabled: true } }),
      prisma.economyConfig.findUnique({ where: { guildId: guild.id }, select: { enabled: true } }),
      prisma.verificationConfig.findUnique({ where: { guildId: guild.id }, select: { enabled: true } }),
      prisma.antiRaidConfig.findUnique({ where: { guildId: guild.id }, select: { enabled: true } }),
      prisma.logConfig.findUnique({ where: { guildId: guild.id }, select: { enabled: true } }),
    ]);

  const modules: ModuleStatus[] = [
    { name: 'Welcome messages', enabled: welcome?.welcomeEnabled ?? false, href: guildPath(guild.id, 'welcome') },
    { name: 'Tickets', enabled: ticket?.enabled ?? false, href: guildPath(guild.id, 'tickets') },
    { name: 'Leveling', enabled: level?.enabled ?? true, href: guildPath(guild.id, 'leveling') },
    { name: 'Economy', enabled: economy?.enabled ?? false, href: guildPath(guild.id, 'economy') },
    { name: 'Verification', enabled: verification?.enabled ?? false, href: guildPath(guild.id, 'verification') },
    { name: 'Anti-raid', enabled: antiRaid?.enabled ?? true, href: guildPath(guild.id, 'anti-raid') },
    { name: 'Logging', enabled: logConfig?.enabled ?? false, href: guildPath(guild.id, 'logging') },
  ];

  return (
    <div>
      <PageHeader
        title="Settings"
        description="General configuration, module overview and the danger zone."
        breadcrumb={[{ label: guild.name, href: `/dashboard/g/${guild.id}` }, { label: 'Settings' }]}
      />
      <SettingsView
        guildId={guild.id}
        initial={{
          embedColor: intToHex(settings?.embedColor ?? 0x5865f2),
          language: settings?.language ?? 'en',
          timezone: settings?.timezone ?? 'UTC',
          commandCooldownSeconds: settings?.commandCooldownSeconds ?? 3,
        }}
        modules={modules}
        guildName={guild.name}
      />
    </div>
  );
}
