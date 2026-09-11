import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, Search, Server } from 'lucide-react';
import { prisma } from '@nexora/database';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/shared/empty-state';
import { Pagination } from '@/components/shared/pagination';
import { PageHeader } from '@/components/shared/page-header';
import { PLAN_VARIANT } from '@/lib/badges';
import { formatDate, formatNumber } from '@/lib/format';
import { parsePagination, param, type SearchParams } from '@/lib/pagination';
import { canViewBilling } from '@/lib/roles';
import { requirePage } from '@/lib/session';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Guilds' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function GuildsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const session = await requirePage('guilds');
  const showBilling = canViewBilling(session.user.adminRole);

  const search = (param(searchParams ?? {}, 'q') ?? '').trim();
  const isNumericId = /^\d+$/.test(search);
  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          ...(isNumericId ? [{ id: search }] : []),
        ],
      }
    : {};

  const total = await prisma.guild.count({ where });
  const { page, skip, pageCount } = parsePagination(searchParams ?? {}, total, PAGE_SIZE);

  const guilds = await prisma.guild.findMany({
    where,
    orderBy: { memberCount: 'desc' },
    skip,
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      icon: true,
      memberCount: true,
      active: true,
      createdAt: true,
    },
  });

  const guildIds = guilds.map((guild) => guild.id);
  const subscriptions = await prisma.subscription.findMany({
    where: { guildId: { in: guildIds }, status: { in: ['ACTIVE', 'TRIALING'] } },
    orderBy: { createdAt: 'desc' },
    select: { guildId: true, plan: true },
  });
  const planByGuild = new Map(subscriptions.map((sub) => [sub.guildId, sub.plan]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Guilds"
        description={`${formatNumber(total)} guild${total === 1 ? '' : 's'} registered on the platform.`}
        actions={
          <form action="/admin/guilds" method="get" className="flex w-full max-w-sm gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={search}
                placeholder="Search by name or guild ID…"
                className="pl-8"
                aria-label="Search guilds"
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
        }
      />

      <Card>
        <CardContent className="p-0">
          {guilds.length === 0 ? (
            <EmptyState
              icon={Server}
              title={search ? 'No guilds match your search' : 'No guilds yet'}
              description={
                search
                  ? `Nothing found for "${search}". Try a different name or the exact guild ID.`
                  : 'Guilds appear here once the bot joins them.'
              }
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Guild</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Status</TableHead>
                  {showBilling ? <TableHead>Plan</TableHead> : null}
                  <TableHead>Created</TableHead>
                  <TableHead className="w-10 pr-6" aria-hidden="true" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {guilds.map((guild) => (
                  <TableRow key={guild.id} className="group relative cursor-pointer">
                    <TableCell className="pl-6 font-medium">
                      <span className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold uppercase">
                          {guild.name.slice(0, 2)}
                        </span>
                        <span className="max-w-[220px] truncate">{guild.name}</span>
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {guild.id}
                    </TableCell>
                    <TableCell>{formatNumber(guild.memberCount)}</TableCell>
                    <TableCell>
                      {guild.active ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="warning">Paused</Badge>
                      )}
                    </TableCell>
                    {showBilling ? (
                      <TableCell>
                        {planByGuild.has(guild.id) ? (
                          <Badge variant={PLAN_VARIANT[planByGuild.get(guild.id) ?? 'FREE']}>
                            {planByGuild.get(guild.id)}
                          </Badge>
                        ) : (
                          <Badge variant="muted">FREE</Badge>
                        )}
                      </TableCell>
                    ) : null}
                    <TableCell className="text-muted-foreground">
                      {formatDate(guild.createdAt)}
                    </TableCell>
                    <TableCell className="pr-6">
                      {/* Stretched link makes the whole row clickable */}
                      <Link
                        href={`/admin/guilds/${guild.id}`}
                        className="absolute inset-0"
                        aria-label={`Open ${guild.name}`}
                      >
                        <ArrowUpRight
                          className={cn(
                            'absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity',
                            'group-hover:opacity-100',
                          )}
                        />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Pagination
        page={page}
        pageCount={pageCount}
        basePath="/admin/guilds"
        searchParams={{ ...(searchParams ?? {}), q: search || undefined }}
      />
    </div>
  );
}
