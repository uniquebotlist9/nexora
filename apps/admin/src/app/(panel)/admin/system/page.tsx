import type { Metadata } from 'next';
import { Activity, ListTodo, Webhook as WebhookIcon } from 'lucide-react';
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
import { AccessDenied } from '@/components/shared/access-denied';
import { EmptyState } from '@/components/shared/empty-state';
import { HealthDot, type HealthStatus } from '@/components/shared/health-dot';
import { RoleGate } from '@/components/shared/role-gate';
import { RequeueDeliveryButton } from '@/app/(panel)/admin/system/requeue-button';
import { WEBHOOK_STATUS_VARIANT } from '@/lib/badges';
import { formatDateTime, formatRelative, formatUptime, truncate } from '@/lib/format';
import { hasRank } from '@/lib/roles';
import { requirePage } from '@/lib/session';
import type { ServiceHealth } from '@nexora/types';

export const metadata: Metadata = { title: 'System' };
export const dynamic = 'force-dynamic';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

interface ApiHealthResult {
  health: ServiceHealth | null;
  error: string | null;
  latencyMs: number | null;
}

async function fetchApiHealth(): Promise<ApiHealthResult> {
  const start = Date.now();
  try {
    const response = await fetch(`${API_URL}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return { health: null, error: `API responded with HTTP ${response.status}.`, latencyMs: Date.now() - start };
    }
    const health = (await response.json()) as ServiceHealth;
    return { health, error: null, latencyMs: Date.now() - start };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown fetch error.';
    return { health: null, error: `Could not reach ${API_URL}/health — ${message}`, latencyMs: null };
  }
}

function CheckRow({ label, status }: { label: string; status: string }) {
  const mapped: HealthStatus =
    status === 'ok' ? 'ok' : status === 'down' ? 'down' : status === 'disabled' || status === 'unknown' ? 'unknown' : 'warn';
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-background/40 px-3 py-2.5">
      <span className="flex items-center gap-2.5 text-sm">
        <HealthDot status={mapped} />
        {label}
      </span>
      <span className="font-mono text-xs uppercase text-muted-foreground">{status}</span>
    </div>
  );
}

export default async function SystemPage() {
  const session = await requirePage('system');
  if (!session) return <AccessDenied page="System" role={null} />;
  const canRequeue = hasRank(session.user.adminRole, 'DEVELOPER');

  const [apiHealth, webhookDeliveries, scheduledTasks, webhookCounts] = await Promise.all([
    fetchApiHealth(),
    prisma.webhookDelivery.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: { endpoint: { select: { name: true, url: true } } },
    }),
    prisma.scheduledTask.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: { guild: { select: { name: true } } },
    }),
    prisma.webhookDelivery.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
  ]);

  const statusCount = (status: string): number =>
    webhookCounts.find((row) => row.status === status)?._count._all ?? 0;

  const overall: HealthStatus = !apiHealth.health
    ? 'down'
    : apiHealth.health.status === 'ok'
      ? 'ok'
      : apiHealth.health.status === 'degraded'
        ? 'warn'
        : 'down';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">System</h2>
        <p className="text-sm text-muted-foreground">
          API health, webhook delivery queue and scheduled task queue.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" />
              API health
            </CardTitle>
            <CardDescription>
              <code className="font-mono text-xs">{API_URL}/health</code> · fetched live
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {apiHealth.error ? (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
                {apiHealth.error}
              </div>
            ) : null}
            {apiHealth.health ? (
              <>
                <div className="flex items-center justify-between gap-3 rounded-md border bg-background/40 px-3 py-2.5">
                  <span className="flex items-center gap-2.5 text-sm">
                    <HealthDot status={overall} />
                    Overall status
                  </span>
                  <span className="text-right text-xs text-muted-foreground">
                    v{apiHealth.health.version} · uptime {formatUptime(apiHealth.health.uptimeSeconds)}
                    {apiHealth.latencyMs !== null ? ` · ${apiHealth.latencyMs} ms` : ''}
                  </span>
                </div>
                <CheckRow label="Database" status={apiHealth.health.checks.database} />
                <CheckRow label="Redis" status={apiHealth.health.checks.redis} />
                <CheckRow label="Discord gateway" status={apiHealth.health.checks.discord} />
              </>
            ) : (
              <div className="flex items-center gap-2.5 rounded-md border bg-background/40 px-3 py-2.5 text-sm">
                <HealthDot status="down" />
                API unreachable
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Webhook queue summary</CardTitle>
            <CardDescription>Delivery counts by status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              {(['PENDING', 'RETRYING', 'DELIVERED', 'FAILED', 'DISABLED'] as const).map((status) => (
                <div key={status} className="rounded-md border bg-background/40 px-3 py-2.5 text-center">
                  <p className="text-lg font-semibold">{statusCount(status)}</p>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {status}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <WebhookIcon className="h-4 w-4 text-primary" />
            Webhook delivery queue
          </CardTitle>
          <CardDescription>Most recent deliveries</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {webhookDeliveries.length === 0 ? (
            <EmptyState
              icon={WebhookIcon}
              title="No webhook deliveries"
              description="Deliveries appear when events are dispatched to registered endpoints."
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Endpoint</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>HTTP</TableHead>
                  <TableHead>Next retry</TableHead>
                  <TableHead className="pr-6">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhookDeliveries.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell className="max-w-[200px] pl-6">
                      <span className="block truncate font-medium">{delivery.endpoint.name}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {truncate(delivery.endpoint.url, 40)}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{delivery.event}</TableCell>
                    <TableCell>
                      <Badge variant={WEBHOOK_STATUS_VARIANT[delivery.status] ?? 'muted'}>
                        {delivery.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{delivery.attempts}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {delivery.statusCode ?? '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {delivery.nextRetryAt ? formatDateTime(delivery.nextRetryAt) : '—'}
                    </TableCell>
                    <TableCell className="pr-6">
                      {canRequeue && (delivery.status === 'FAILED' || delivery.status === 'RETRYING') ? (
                        <RequeueDeliveryButton deliveryId={delivery.id} event={delivery.event} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListTodo className="h-4 w-4 text-primary" />
            Scheduled task queue
          </CardTitle>
          <CardDescription>Most recent tasks</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {scheduledTasks.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              title="No scheduled tasks"
              description="Tasks appear when automations, giveaways or reminders are scheduled."
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Kind</TableHead>
                  <TableHead>Guild</TableHead>
                  <TableHead>Run at</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="pr-6">Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scheduledTasks.map((task) => {
                  const state = task.completedAt
                    ? { label: 'Completed', variant: 'success' as const }
                    : task.error
                      ? { label: 'Failed', variant: 'destructive' as const }
                      : { label: 'Pending', variant: 'info' as const };
                  return (
                    <TableRow key={task.id}>
                      <TableCell className="pl-6 font-mono text-xs">{task.kind}</TableCell>
                      <TableCell className="max-w-[160px] truncate">{task.guild?.name ?? task.guildId}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(task.runAt)}
                        <span className="block text-xs">{formatRelative(task.runAt)}</span>
                      </TableCell>
                      <TableCell>{task.attempts}</TableCell>
                      <TableCell>
                        <Badge variant={state.variant}>{state.label}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[220px] pr-6">
                        <code
                          className="block truncate font-mono text-xs text-red-400"
                          title={task.error ?? ''}
                        >
                          {task.error ? truncate(task.error, 42) : '—'}
                        </code>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ANALYST never reaches this page; the gate documents intent */}
      <RoleGate role={session.user.adminRole} minRank="DEVELOPER">
        <p className="text-xs text-muted-foreground">
          Requeue resets a failed delivery to PENDING and clears its retry backoff.
        </p>
      </RoleGate>
    </div>
  );
}
