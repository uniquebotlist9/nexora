import Link from 'next/link';
import { getEnv } from '@nexora/config';
import { prisma } from '@nexora/database';
import type { ServiceHealth } from '@nexora/types';
import { Activity, ArrowUpRight, CreditCard, Server, ShieldCheck, Store, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { HealthDot, type HealthStatus } from '@/components/shared/health-dot';
import { KpiCard } from '@/components/shared/kpi-card';
import { PageHeader } from '@/components/shared/page-header';
import { ACTOR_TYPE_VARIANT, PLAN_VARIANT } from '@/lib/badges';
import { ALL_PLANS, PLAN_PRICES, formatCurrency, formatNumber, formatRelative, formatUptime, truncate } from '@/lib/format';
import { requirePage } from '@/lib/session';

export const dynamic = 'force-dynamic';

const ACTIVE_SUB_STATUSES = ['ACTIVE', 'TRIALING'];

interface SystemStatus {
  database: HealthStatus;
  api: HealthStatus;
  cache: HealthStatus;
  apiUptime: string;
  apiVersion: string | null;
}

/** Probe the public API health endpoint; returns null when unreachable. */
async function fetchApiHealth(): Promise<ServiceHealth | null> {
  try {
    const response = await fetch(`${getEnv().API_URL}/v1/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok && response.status !== 503) return null;
    const body = (await response.json()) as ServiceHealth;
    return body;
  } catch {
    return null;
  }
}

function mapCheck(check: 'ok' | 'down' | 'disabled' | undefined, reachable: boolean): HealthStatus {
  if (!reachable) return 'unknown';
  if (check === 'ok') return 'ok';
  if (check === 'down') return 'down';
  return 'unknown';
}

export default async function AdminOverviewPage() {
  await requirePage('overview');

  const now = new Date();
  const startOfTodayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const [
    totalGuilds,
    activeGuilds,
    totalUsers,
    commandsTodayAgg,
    planGroups,
    recentActions,
    dbPing,
    apiHealth,
  ] = await Promise.all([
    prisma.guild.count(),
    prisma.guild.count({ where: { active: true } }),
    prisma.user.count(),
    prisma.analyticsDaily.aggregate({
      where: { date: { gte: startOfTodayUtc } },
      _sum: { commandsUsed: true },
    }),
    prisma.subscription.groupBy({
      by: ['plan'],
      where: { status: { in: ACTIVE_SUB_STATUSES } },
      _count: { _all: true },
    }),
    prisma.auditLog.findMany({
      where: { actorType: 'USER' },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.$runCommandRaw({ ping: 1 }).then(() => true).catch(() => false),
    fetchApiHealth(),
  ]);

  const commandsToday = commandsTodayAgg._sum.commandsUsed ?? 0;

  const planCounts = new Map(planGroups.map((group) => [group.plan, group._count._all]));
  const activeSubs = ALL_PLANS.map((plan) => ({ plan, count: planCounts.get(plan) ?? 0 }));
  const totalActiveSubs = activeSubs.reduce((sum, entry) => sum + entry.count, 0);
  const mrrEstimate = activeSubs.reduce(
    (sum, entry) => sum + entry.count * (PLAN_PRICES[entry.plan] ?? 0),
    0,
  );

  const status: SystemStatus = {
    database: dbPing ? 'ok' : 'down',
    api: apiHealth
      ? apiHealth.status === 'ok'
        ? 'ok'
        : apiHealth.status === 'degraded'
          ? 'warn'
          : 'down'
      : 'down',
    cache: mapCheck(apiHealth?.checks.redis, apiHealth !== null),
    apiUptime: apiHealth ? formatUptime(apiHealth.uptimeSeconds) : '—',
    apiVersion: apiHealth?.version ?? null,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Platform-wide health, activity and subscription snapshot."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/audit">
              <ArrowUpRight />
              Audit log
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Total guilds"
          value={formatNumber(totalGuilds)}
          description={`${formatNumber(activeGuilds)} active`}
          icon={Store}
        />
        <KpiCard
          title="Users"
          value={formatNumber(totalUsers)}
          description="Known Discord users"
          icon={Users}
        />
        <KpiCard
          title="Commands today"
          value={formatNumber(commandsToday)}
          description="Since 00:00 UTC"
          icon={Activity}
          iconClassName="bg-sky-500/10 text-sky-400"
        />
        <KpiCard
          title="Active subscriptions"
          value={formatNumber(totalActiveSubs)}
          description={`~${formatCurrency(mrrEstimate)} MRR`}
          icon={CreditCard}
          iconClassName="bg-emerald-500/10 text-emerald-400"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4 text-muted-foreground" />
              System status
            </CardTitle>
            <CardDescription>Live probes — database ping and API health.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-3 text-sm">
              <li className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <HealthDot status={status.database} />
                  Database
                </span>
                <span className="text-muted-foreground">
                  {status.database === 'ok' ? 'MongoDB reachable' : 'Unreachable'}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <HealthDot status={status.api} />
                  API service
                </span>
                <span className="text-muted-foreground">
                  {apiHealth
                    ? `${apiHealth.status} · v${apiHealth.version} · up ${status.apiUptime}`
                    : 'Unreachable'}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <HealthDot status={status.cache} />
                  Cache
                </span>
                <span className="text-muted-foreground">
                  {apiHealth
                    ? apiHealth.checks.redis === 'disabled'
                      ? 'Disabled'
                      : apiHealth.checks.redis === 'ok'
                        ? 'Redis healthy'
                        : 'Redis down'
                    : 'Unknown'}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <HealthDot status={status.database === 'ok' && status.api === 'ok' ? 'ok' : 'warn'} />
                  Database (via API)
                </span>
                <span className="text-muted-foreground">
                  {apiHealth ? apiHealth.checks.database : 'Unknown'}
                </span>
              </li>
            </ul>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href="/admin/system">
                <ShieldCheck />
                System detail
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Active subscriptions by plan</CardTitle>
            <CardDescription>Includes ACTIVE and TRIALING subscriptions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeSubs.map((entry) => (
              <div key={entry.plan} className="flex items-center justify-between gap-3 text-sm">
                <Badge variant={PLAN_VARIANT[entry.plan] ?? 'muted'}>{entry.plan}</Badge>
                <span className="font-medium">{formatNumber(entry.count)}</span>
              </div>
            ))}
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href="/admin/subscriptions">
                <CreditCard />
                Manage subscriptions
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Recent staff actions</CardTitle>
            <CardDescription>Latest mutations performed from this console.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActions.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title="No staff actions yet"
                description="Audit entries created by staff will appear here."
                className="border-0 py-6"
              />
            ) : (
              <ul className="space-y-3">
                {recentActions.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{entry.action}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {truncate(entry.actorId, 16)}
                        {entry.targetId ? ` → ${truncate(entry.targetId, 16)}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge variant={ACTOR_TYPE_VARIANT[entry.actorType] ?? 'muted'}>
                        {entry.actorType}
                      </Badge>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatRelative(entry.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
