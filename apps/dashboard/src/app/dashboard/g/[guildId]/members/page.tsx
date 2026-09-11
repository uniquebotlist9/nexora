import { prisma } from '@nexora/database';
import { getGuildContext } from '@/lib/guild';
import { PageHeader } from '@/components/shared/page-header';
import { MembersTable, type MemberRow } from './members-table';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Members' };

const PAGE_SIZE = 25;

export default async function MembersPage({
  params,
  searchParams,
}: {
  params: { guildId: string };
  searchParams: { q?: string; staff?: string; page?: string };
}) {
  const ctx = await getGuildContext(params.guildId);
  if (!ctx.ok) return null;
  const { guild } = ctx;

  const q = searchParams.q?.trim() ?? '';
  const staffOnly = searchParams.staff === '1';
  const page = Math.max(1, Number(searchParams.page ?? '1') || 1);

  // Valid snowflake → exact lookup; otherwise no results (we only index IDs).
  const where = {
    guildId: guild.id,
    leftAt: null,
    ...(staffOnly ? { isStaff: true } : {}),
    ...(q && /^\d{15,21}$/.test(q) ? { userId: q } : q ? { userId: '__none__' } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.guildMember.count({ where }),
    prisma.guildMember.findMany({
      where,
      orderBy: { joinedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        level: { select: { level: true } },
        _count: { select: { warnings: true, tickets: true } },
        economyAccount: { select: { balance: true } },
      },
    }),
  ]);

  const members: MemberRow[] = rows.map((m) => ({
    memberId: m.id,
    userId: m.userId,
    isStaff: m.isStaff,
    level: m.level?.level ?? null,
    xp: m.xp,
    messageCount: m.messageCount,
    voiceMinutes: m.voiceMinutes,
    warnings: m._count.warnings,
    balance: m.economyAccount?.balance ?? null,
    tickets: m._count.tickets,
    joinedAt: m.joinedAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader
        title="Members"
        description="Everyone the bot has seen, with levels, warnings, economy and tickets."
        breadcrumb={[{ label: guild.name, href: `/dashboard/g/${guild.id}` }, { label: 'Members' }]}
      />
      <MembersTable
        members={members}
        total={total}
        page={page}
        pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        guildId={guild.id}
      />
    </div>
  );
}
