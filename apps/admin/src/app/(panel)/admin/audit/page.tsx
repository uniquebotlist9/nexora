import type { Metadata } from 'next';
import Link from 'next/link';
import { endOfDay, parse, startOfDay } from 'date-fns';
import { ScrollText, Search } from 'lucide-react';
import type { Prisma } from '@nexora/database';
import { prisma } from '@nexora/database';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AccessDenied } from '@/components/shared/access-denied';
import { EmptyState } from '@/components/shared/empty-state';
import { Pagination } from '@/components/shared/pagination';
import { ACTOR_TYPE_VARIANT } from '@/lib/badges';
import { formatDateTime, formatNumber } from '@/lib/format';
import { parsePagination, param, type SearchParams } from '@/lib/pagination';
import { requirePage } from '@/lib/session';

export const metadata: Metadata = { title: 'Audit Log' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

function parseDateInput(value: string | undefined, end: boolean): Date | undefined {
  if (!value) return undefined;
  const parsed = parse(value, 'yyyy-MM-dd', new Date());
  if (Number.isNaN(parsed.getTime())) return undefined;
  return end ? endOfDay(parsed) : startOfDay(parsed);
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const session = await requirePage('audit');
  if (!session) return <AccessDenied page="Audit Log" role={null} />;

  const params = searchParams ?? {};
  const rawActorType = param(params, 'actorType');
  const actorType = ['USER', 'BOT', 'API', 'SYSTEM'].includes(rawActorType ?? '')
    ? (rawActorType as 'USER' | 'BOT' | 'API' | 'SYSTEM')
    : undefined;
  const actionContains = (param(params, 'action') ?? '').trim() || undefined;
  const guildId = (param(params, 'guildId') ?? '').trim() || undefined;
  const from = parseDateInput(param(params, 'from'), false);
  const to = parseDateInput(param(params, 'to'), true);

  const where: Prisma.AuditLogWhereInput = {
    ...(actorType ? { actorType } : {}),
    ...(actionContains
      ? { action: { contains: actionContains, mode: 'insensitive' } }
      : {}),
    ...(guildId ? { guildId } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
  };

  const total = await prisma.auditLog.count({ where });
  const { page, skip, pageCount } = parsePagination(params, total, PAGE_SIZE);

  const entries = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip,
    take: PAGE_SIZE,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Audit Log</h2>
        <p className="text-sm text-muted-foreground">
          {formatNumber(total)} entr{total === 1 ? 'y' : 'ies'} matching the current filters.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <form action="/audit" method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <label className="space-y-1.5 text-sm">
              <span className="text-muted-foreground">Actor type</span>
              <Select name="actorType" defaultValue={actorType ?? ''}>
                <option value="">All</option>
                <option value="USER">USER</option>
                <option value="BOT">BOT</option>
                <option value="API">API</option>
                <option value="SYSTEM">SYSTEM</option>
              </Select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-muted-foreground">Action contains</span>
              <Input name="action" defaultValue={actionContains ?? ''} placeholder="admin.guild…" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-muted-foreground">Guild ID</span>
              <Input name="guildId" defaultValue={guildId ?? ''} placeholder="Exact guild ID" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-muted-foreground">From</span>
              <Input type="date" name="from" defaultValue={param(params, 'from') ?? ''} />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-muted-foreground">To</span>
              <Input type="date" name="to" defaultValue={param(params, 'to') ?? ''} />
            </label>
            <div className="flex items-end gap-2">
              <Button type="submit" className="flex-1">
                <Search />
                Apply
              </Button>
              <Button asChild variant="ghost">
                <Link href="/audit">Clear</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="No audit entries"
              description="No entries match the current filters. Adjust the filters and try again."
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Guild</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="pr-6">Metadata</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap pl-6 text-muted-foreground">
                      {formatDateTime(entry.createdAt)}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <Badge variant={ACTOR_TYPE_VARIANT[entry.actorType] ?? 'muted'}>
                          {entry.actorType}
                        </Badge>
                        <span className="font-mono text-xs text-muted-foreground">
                          {entry.actorId ?? '—'}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {entry.guildId ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {entry.targetType ? `${entry.targetType} ${entry.targetId ?? ''}` : '—'}
                    </TableCell>
                    <TableCell className="max-w-[260px] pr-6">
                      <code
                        className="block truncate font-mono text-xs text-muted-foreground"
                        title={JSON.stringify(entry.metadata ?? {})}
                      >
                        {JSON.stringify(entry.metadata ?? {})}
                      </code>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Pagination page={page} pageCount={pageCount} basePath="/admin/audit" searchParams={params} />
    </div>
  );
}
