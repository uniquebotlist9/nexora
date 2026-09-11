import { prisma } from '@nexora/database';
import { getGuildContext } from '@/lib/guild';
import { PageHeader } from '@/components/shared/page-header';
import { BackupsView, type BackupView } from './backups-view';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Backups' };

export default async function BackupsPage({ params }: { params: { guildId: string } }) {
  const ctx = await getGuildContext(params.guildId);
  if (!ctx.ok) return null;
  const { guild, limits } = ctx;

  const backups = await prisma.backup.findMany({
    where: { guildId: guild.id },
    orderBy: { createdAt: 'desc' },
    take: limits.backups,
  });

  const views: BackupView[] = backups.map((b) => ({
    id: b.id,
    name: b.name,
    sizeBytes: b.sizeBytes,
    checksum: b.checksum,
    scheduled: b.scheduled,
    verified: b.verified,
    createdAt: b.createdAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader
        title="Backups"
        description="Configuration snapshots with checksums, download and restore."
        breadcrumb={[{ label: guild.name, href: `/dashboard/g/${guild.id}` }, { label: 'Backups' }]}
      />
      <BackupsView
        guildId={guild.id}
        backups={views}
        guildName={guild.name}
        limit={limits.backups}
      />
    </div>
  );
}
