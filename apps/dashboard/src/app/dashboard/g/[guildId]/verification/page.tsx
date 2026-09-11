import { prisma } from '@nexora/database';
import { getGuildContext } from '@/lib/guild';
import { loadRoles, loadChannels } from '@/lib/guild-data';
import { PageHeader } from '@/components/shared/page-header';
import { VerificationEditor, type VerificationState } from './verification-editor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Verification' };

export default async function VerificationPage({ params }: { params: { guildId: string } }) {
  const ctx = await getGuildContext(params.guildId);
  if (!ctx.ok) return null;
  const { guild } = ctx;

  const [config, roles, channels] = await Promise.all([
    prisma.verificationConfig.findUnique({ where: { guildId: guild.id } }),
    loadRoles(guild.id),
    loadChannels(guild.id),
  ]);

  const initial: VerificationState = {
    enabled: config?.enabled ?? false,
    mode: config?.mode ?? 'BUTTON',
    channelId: config?.channelId ?? null,
    roleId: config?.roleId ?? null,
    unverifiedRoleId: config?.unverifiedRoleId ?? null,
    minAccountAgeHours: config?.minAccountAgeHours ?? 0,
    timeoutMinutes: config?.timeoutMinutes ?? 60,
    kickOnTimeout: config?.kickOnTimeout ?? false,
    attemptsAllowed: config?.attemptsAllowed ?? 3,
  };

  return (
    <div>
      <PageHeader
        title="Verification"
        description="Gate new members behind a button, captcha or reaction check."
        breadcrumb={[{ label: guild.name, href: `/dashboard/g/${guild.id}` }, { label: 'Verification' }]}
      />
      <VerificationEditor guildId={guild.id} initial={initial} roles={roles} channels={channels} />
    </div>
  );
}
