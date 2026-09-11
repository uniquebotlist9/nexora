import { prisma } from '@nexora/database';
import { format, subDays } from 'date-fns';
import { BarChart3 } from 'lucide-react';
import { getGuildContext } from '@/lib/guild';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { MiniChart, type SeriesPoint } from '@/components/shared/mini-chart';
import { AnalyticsRangePicker, type AnalyticsRange } from './range-picker';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Analytics' };

const RANGE_DAYS: Record<Exclude<AnalyticsRange, 'custom'>, number> = {
  '7': 7,
  '30': 30,
  '90': 90,
  '365': 365,
};

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: { guildId: string };
  searchParams: { range?: string; from?: string; to?: string };
}) {
  const ctx = await getGuildContext(params.guildId);
  if (!ctx.ok) return null;
  const { guild, plan, limits } = ctx;

  const requestedRange = (searchParams.range ?? '30') as AnalyticsRange;
  const isCustom = requestedRange === 'custom';

  // Determine the requested window (in days) for gating.
  let days = 30;
  if (!isCustom && requestedRange in RANGE_DAYS) days = RANGE_DAYS[requestedRange as Exclude<AnalyticsRange, 'custom'>];
  if (isCustom) {
    const from = searchParams.from ? new Date(searchParams.from) : null;
    const to = searchParams.to ? new Date(searchParams.to) : new Date();
    if (from && !Number.isNaN(from.getTime())) {
      days = Math.min(365, Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86_400_000)));
    }
  }

  // Plan gate: ranges beyond the plan's retention are locked (upgrade CTA shown client-side).
  const locked = days > limits.analyticsRetentionDays;
  const effectiveDays = locked ? limits.analyticsRetentionDays : days;
  const since = subDays(new Date(), effectiveDays);

  const [analytics, commandStats] = await Promise.all([
    prisma.analyticsDaily.findMany({
      where: { guildId: guild.id, date: { gte: since } },
      orderBy: { date: 'asc' },
    }),
    prisma.commandStat.findMany({
      where: { guildId: guild.id },
      orderBy: { uses: 'desc' },
      take: 10,
    }),
  ]);

  const pt = (label: string) => (label.length > 6 ? label.slice(0, 6) : label);

  const membersSeries: SeriesPoint[] = analytics.map((a) => ({ label: pt(format(a.date, 'MMM d')), value: a.members }));
  const joinsSeries: SeriesPoint[] = analytics.map((a) => ({
    label: pt(format(a.date, 'MMM d')),
    joins: a.joins,
    leaves: a.leaves,
  }));
  const messagesSeries: SeriesPoint[] = analytics.map((a) => ({ label: pt(format(a.date, 'MMM d')), value: a.messages }));
  const activeSeries: SeriesPoint[] = analytics.map((a) => ({ label: pt(format(a.date, 'MMM d')), value: a.activeUsers }));
  const voiceSeries: SeriesPoint[] = analytics.map((a) => ({ label: pt(format(a.date, 'MMM d')), value: a.voiceMinutes }));
  const modSeries: SeriesPoint[] = analytics.map((a) => ({ label: pt(format(a.date, 'MMM d')), value: a.modActions }));
  const commandSeries: SeriesPoint[] = commandStats.map((c) => ({ label: c.commandName, value: c.uses }));

  const hasData = analytics.length > 0;

  return (
    <div>
      <PageHeader
        title="Analytics"
        description={`Community trends over the last ${effectiveDays} day${effectiveDays === 1 ? '' : 's'}.`}
        breadcrumb={[{ label: guild.name, href: `/dashboard/g/${guild.id}` }, { label: 'Analytics' }]}
      />

      <AnalyticsRangePicker
        guildId={guild.id}
        current={requestedRange}
        from={searchParams.from}
        to={searchParams.to}
        retentionDays={limits.analyticsRetentionDays}
        plan={plan}
      />

      {!hasData ? (
        <EmptyState
          icon={BarChart3}
          title="No analytics data yet"
          description="Daily aggregates are recorded by the bot once it has been online in your server."
        />
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <ChartCard title="Member growth" description="Total members at end of day">
            <MiniChart data={membersSeries} dataKey="value" type="line" color="#8B5CF6" />
          </ChartCard>
          <ChartCard title="Joins vs leaves" description="Daily member flow">
            <div>
              <MiniChart data={joinsSeries.map((p) => ({ label: p.label, value: p.joins }))} dataKey="value" type="bar" color="#5865F2" height={70} />
              <MiniChart data={joinsSeries.map((p) => ({ label: p.label, value: p.leaves }))} dataKey="value" type="bar" color="#EF4444" height={70} />
            </div>
          </ChartCard>
          <ChartCard title="Messages" description="Messages per day">
            <MiniChart data={messagesSeries} dataKey="value" type="area" />
          </ChartCard>
          <ChartCard title="Active users" description="Members who sent at least one message">
            <MiniChart data={activeSeries} dataKey="value" type="line" color="#10B981" />
          </ChartCard>
          <ChartCard title="Voice minutes" description="Aggregate time in voice channels">
            <MiniChart data={voiceSeries} dataKey="value" type="bar" color="#F59E0B" />
          </ChartCard>
          <ChartCard title="Moderation trend" description="Mod actions per day">
            <MiniChart data={modSeries} dataKey="value" type="line" color="#EF4444" />
          </ChartCard>
          <ChartCard title="Command usage" description="Top 10 commands by uses" className="lg:col-span-2">
            {commandSeries.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No command usage recorded yet.</p>
            ) : (
              <MiniChart data={commandSeries} dataKey="value" type="bar" color="#8B5CF6" />
            )}
          </ChartCard>
        </div>
      )}
    </div>
  );
}

function ChartCard({
  title,
  description,
  className,
  children,
}: {
  title: string;
  description: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
