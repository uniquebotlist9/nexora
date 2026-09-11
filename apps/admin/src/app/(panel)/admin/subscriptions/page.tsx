import type { Metadata } from 'next';
import { CreditCard, Receipt } from 'lucide-react';
import { prisma } from '@nexora/database';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PlanPieChart } from '@/components/charts/plan-pie-chart';
import { AccessDenied } from '@/components/shared/access-denied';
import { EmptyState } from '@/components/shared/empty-state';
import { Pagination } from '@/components/shared/pagination';
import { RoleGate } from '@/components/shared/role-gate';
import { GrantPlanForm } from '@/app/(panel)/admin/subscriptions/grant-form';
import { PLAN_VARIANT, SUBSCRIPTION_STATUS_VARIANT } from '@/lib/badges';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { parsePagination, type SearchParams } from '@/lib/pagination';
import { requirePage } from '@/lib/session';

export const metadata: Metadata = { title: 'Subscriptions' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const session = await requirePage('subscriptions');
  if (!session) return <AccessDenied page="Subscriptions" role={null} />;

  const total = await prisma.subscription.count();
  const { page, skip, pageCount } = parsePagination(searchParams ?? {}, total, PAGE_SIZE);

  const [subscriptions, planGroups, paymentEvents] = await Promise.all([
    prisma.subscription.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: PAGE_SIZE,
      include: { user: { select: { id: true } } },
    }),
    prisma.subscription.groupBy({
      by: ['plan'],
      where: { status: { in: ['ACTIVE', 'TRIALING'] } },
      _count: { _all: true },
      orderBy: { _count: { plan: 'desc' } },
    }),
    prisma.paymentEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: {
        id: true,
        provider: true,
        eventId: true,
        type: true,
        processedAt: true,
        createdAt: true,
      },
    }),
  ]);

  // Subscription → Guild join is manual (no relation on the model)
  const guildIds = [
    ...new Set(subscriptions.map((sub) => sub.guildId).filter((id): id is string => id !== null)),
  ];
  const guilds = await prisma.guild.findMany({
    where: { id: { in: guildIds } },
    select: { id: true, name: true },
  });
  const guildNameById = new Map(guilds.map((guild) => [guild.id, guild.name]));

  const planData = planGroups.map((group) => ({ plan: group.plan, count: group._count._all }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Subscriptions</h2>
        <p className="text-sm text-muted-foreground">
          {formatNumber(total)} subscription{total === 1 ? '' : 's'} recorded.
        </p>
      </div>

      <RoleGate role={session.user.adminRole} minRank="ADMINISTRATOR">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manual plan grant</CardTitle>
            <CardDescription>
              Create or extend an internal subscription (OWNER / ADMINISTRATOR only).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GrantPlanForm />
          </CardContent>
        </Card>
      </RoleGate>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plan distribution</CardTitle>
            <CardDescription>Active + trialing subscriptions</CardDescription>
          </CardHeader>
          <CardContent>
            <PlanPieChart data={planData} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4 text-primary" />
              Payment events
            </CardTitle>
            <CardDescription>Latest events received from payment providers</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {paymentEvents.length === 0 ? (
              <EmptyState
                icon={CreditCard}
                title="No payment events"
                description="PaymentEvent rows appear when provider webhooks are processed."
                className="border-0"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Provider</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Event ID</TableHead>
                    <TableHead>Processed</TableHead>
                    <TableHead className="pr-6">Received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="pl-6">
                        <Badge variant="info">{event.provider}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{event.type}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {event.eventId}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {event.processedAt ? formatDateTime(event.processedAt) : 'Pending'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap pr-6 text-muted-foreground">
                        {formatDateTime(event.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All subscriptions</CardTitle>
          <CardDescription>Newest first</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {subscriptions.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No subscriptions yet"
              description="Subscriptions appear here once purchased or granted."
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Guild</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Period ends</TableHead>
                  <TableHead className="pr-6">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((subscription) => (
                  <TableRow key={subscription.id}>
                    <TableCell className="pl-6">
                      <Badge variant={PLAN_VARIANT[subscription.plan] ?? 'muted'}>
                        {subscription.plan}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={SUBSCRIPTION_STATUS_VARIANT[subscription.status] ?? 'muted'}
                      >
                        {subscription.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate">
                      {subscription.guildId
                        ? (guildNameById.get(subscription.guildId) ?? subscription.guildId)
                        : '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {subscription.user.id}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{subscription.provider}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {subscription.currentPeriodEnd
                        ? formatDate(subscription.currentPeriodEnd)
                        : '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap pr-6 text-muted-foreground">
                      {formatDate(subscription.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Pagination page={page} pageCount={pageCount} basePath="/admin/subscriptions" searchParams={searchParams} />
    </div>
  );
}
