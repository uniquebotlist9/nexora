import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, Search, Users as UsersIcon } from 'lucide-react';
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
import { PLAN_VARIANT, SUBSCRIPTION_STATUS_VARIANT } from '@/lib/badges';
import { formatDate, formatNumber, formatRelative } from '@/lib/format';
import { parsePagination, param, type SearchParams } from '@/lib/pagination';
import { requirePage } from '@/lib/session';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Users' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function UsersPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requirePage('users');

  const search = (param(searchParams ?? {}, 'q') ?? '').trim();
  const isSnowflake = /^\d{15,21}$/.test(search);
  const where = search ? (isSnowflake ? { id: search } : { id: { in: [] } }) : {};

  const total = await prisma.user.count({ where });
  const { page, skip, pageCount } = parsePagination(searchParams ?? {}, total, PAGE_SIZE);

  const users = await prisma.user.findMany({
    where,
    orderBy: { lastSeenAt: 'desc' },
    skip,
    take: PAGE_SIZE,
    select: {
      id: true,
      createdAt: true,
      lastSeenAt: true,
      _count: { select: { guildMemberships: true } },
      subscriptions: {
        where: { status: { in: ['ACTIVE', 'TRIALING'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { plan: true, status: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description={`${formatNumber(total)} user${total === 1 ? '' : 's'} known to the platform.`}
        actions={
          <form action="/admin/users" method="get" className="flex w-full max-w-sm gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={search}
                placeholder="Search by user ID…"
                className="pl-8"
                aria-label="Search users by ID"
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
          {users.length === 0 ? (
            <EmptyState
              icon={UsersIcon}
              title={search ? 'No users match your search' : 'No users yet'}
              description={
                search
                  ? isSnowflake
                    ? `No user with ID ${search} exists.`
                    : 'Search requires the exact Discord user ID (15-21 digits).'
                  : 'Users appear here once they interact with the bot.'
              }
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">User ID</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead>Guilds</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>First seen</TableHead>
                  <TableHead className="w-10 pr-6" aria-hidden="true" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const subscription = user.subscriptions[0];
                  return (
                    <TableRow key={user.id} className="group relative cursor-pointer">
                      <TableCell className="pl-6 font-mono text-xs">{user.id}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatRelative(user.lastSeenAt)}
                      </TableCell>
                      <TableCell>{formatNumber(user._count.guildMemberships)}</TableCell>
                      <TableCell>
                        {subscription ? (
                          <span className="flex items-center gap-1.5">
                            <Badge variant={PLAN_VARIANT[subscription.plan] ?? 'muted'}>
                              {subscription.plan}
                            </Badge>
                            <Badge
                              variant={SUBSCRIPTION_STATUS_VARIANT[subscription.status] ?? 'muted'}
                            >
                              {subscription.status}
                            </Badge>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap pr-6 text-muted-foreground">
                        {formatDate(user.createdAt)}
                      </TableCell>
                      <TableCell className="pr-6">
                        {/* Stretched link makes the whole row clickable */}
                        <Link
                          href={`/admin/users/${user.id}`}
                          className="absolute inset-0"
                          aria-label={`Open user ${user.id}`}
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
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Pagination
        page={page}
        pageCount={pageCount}
        basePath="/admin/users"
        searchParams={{ ...(searchParams ?? {}), q: search || undefined }}
      />
    </div>
  );
}
