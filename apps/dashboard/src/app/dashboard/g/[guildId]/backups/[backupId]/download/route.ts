import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@nexora/database';
import { getSession } from '@/lib/guild';
import { getGuildContext } from '@/lib/guild';

/**
 * Stream a backup's JSON data as a download. Access-checked server-side
 * (session + guild manager/admin) — the file itself never goes through
 * the bot.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { guildId: string; backupId: string } },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ctx = await getGuildContext(params.guildId);
  if (!ctx.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const backup = await prisma.backup.findFirst({
    where: { id: params.backupId, guildId: params.guildId },
  });
  if (!backup) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = JSON.stringify(
    { id: backup.id, name: backup.name, guildId: backup.guildId, createdAt: backup.createdAt, checksum: backup.checksum, data: backup.data },
    null,
    2,
  );

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="nexora-backup-${backup.name.replace(/[^a-z0-9-_]/gi, '_')}-${backup.createdAt.toISOString().slice(0, 10)}.json"`,
    },
  });
}
