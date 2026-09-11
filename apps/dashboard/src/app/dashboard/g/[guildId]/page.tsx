import { prisma } from '@nexora/database';
import { format, subDays } from 'date-fns';
import {
  MessageSquare, ShieldCheck, Ticket, UserPlus, Users, Activity, Bot,
} from 'lucide-react';
import { getGuildContext, fetchBotStatus } from '@/lib/guild';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { MiniChart, type SeriesPoint } from '@/components/shared/mini-chart';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { relativeTime, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Overview' };

export default async function OverviewPage({ params }: { params: { guildId: string } }) {
  const ctx = await getGuildContext(params.guildId);
  // Guards are enforced by the guild layout; pages can assume ctx.ok.
  if (!ctx.ok) return null;
  const { guild } = ctx;

  const since7d = subDays(new Date(), 7);
  const since30d = subDays(new Date(), 30);

  const [
    openTickets,
    modActions7d,
    activeUsers,
    analytics,
    recentAudit,
    recentCases,
    botStatus,
  ] = await Promise.all([
    prisma.ticket.count({ where: { guildId: guild.id, status: { in: ['OPEN', 'CLAIMED'] } } }),
    prisma.moderationCase.count({ where: { guildId: guild.id, createdAt: { gte: since7d } } }),
    prisma.analyticsDaily.findFirst({
      where: { guildId: guild.id },
      orderBy: { date: 'desc' },
      select: { activeUsers: true },
    }),
    prisma.analyticsDaily.findMany({
      where: { guildId: guild.id, date: { gte: since30d } },
      orderBy: { date: 'asc' },
    }),
    prisma.auditLog.findMany({
      where: { guildId: guild.id },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.moderationCase.findMany({
      where: { guildId: guild.id },
      orderBy: { createdAt: 'desc' },
      take: 6,
      include: { targetUser: { select: { id: true } } },
    }),
    fetchBotStatus(),
  ]);

  const messages7d = analytics
    .filter((a) => a.date >= since7d)
    .reduce((sum, a) => sum + a.messages, 0);

  const joinsSeries: SeriesPoint[] = analytics.map((a) => ({
    label: format(a.date, 'MMM d'),
    joins: a.joins,
  }));
  const messagesSeries: SeriesPoint[] = analytics.map((a) => ({
    label: format(a.date, 'MMM d'),
    messages: a.messages,
  }));

  return (
    <div>
      <PageHeader
        title="Overview"
        description={`Activity and health for ${guild.name}.`}
        breadcrumb={[{ label: guild.name, href: `/dashboard/g/${guild.id}` }, { label: 'Overview' }]}
        actions={
          <Badge variant={botStatus.online ? 'success' : 'destructive'}>
            <span
              className={`h-1.5 w-1.5 rounded-full ${botStatus.online ? 'bg-emerald-500' : 'bg-destructive'}`}
              aria-hidden="true"
            />
            Bot {botStatus.online ? botStatus.detail : 'offline'}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Members" value={formatNumber(guild.memberCount)} icon={Users} />
        <StatCard label="Messages (7d)" value={formatNumber(messages7d)} icon={MessageSquare} />
        <StatCard label="Active users" value={formatNumber(activeUsers?.activeUsers ?? 0)} icon={Activity} />
        <StatCard label="Open tickets" value={openTickets} icon={Ticket} />
        <StatCard label="Mod actions (7d)" value={modActions7d} icon={ShieldCheck} />
        <StatCard
          label="Bot status"
          value={botStatus.online ? 'Online' : 'Offline'}
          icon={Bot}
          trend={botStatus.online ? undefined : 'REST API unreachable'}
          trendPositive={false}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Member joins</CardTitle>
            <CardDescription>Daily joins over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {joinsSeries.length === 0 ? (
              <EmptyState
                icon={UserPlus}
                title="No analytics yet"
                description="Daily aggregates appear once the bot has been online for a day."
                className="border-0 py-8"
              />
            ) : (
              <MiniChart data={joinsSeries} dataKey="joins" type="bar" color="#8B5CF6" />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Messages</CardTitle>
            <CardDescription>Daily message volume over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {messagesSeries.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="No analytics yet"
                description="Daily aggregates appear once the bot has been online for a day."
                className="border-0 py-8"
              />
            ) : (
              <MiniChart data={messagesSeries} dataKey="messages" type="area" />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent dashboard activity</CardTitle>
            <CardDescription>Audit log of configuration changes</CardDescription>
          </CardHeader>
          <CardContent>
            {recentAudit.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="No activity yet"
                description="Changes made from this dashboard will be logged here."
                className="border-0 py-8"
              />
            ) : (
              <ul className="divide-y divide-border/60">
                {recentAudit.map((log) => (
                  <li key={log.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0 truncate">
                      <Badge variant="outline" className="mr-2 text-[10px] uppercase">
                        {log.actorType}
                      </Badge>
                      {log.action}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {relativeTime(log.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent moderation cases</CardTitle>
            <CardDescription>Latest actions taken by moderators and AutoMod</CardDescription>
          </CardHeader>
          <CardContent>
            {recentCases.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title="No cases yet"
                description="Moderation cases will appear here as they are issued."
                className="border-0 py-8"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead className="text-right">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentCases.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">#{c.caseNumber}</TableCell>
                      <TableCell>
                        <Badge variant={c.type === 'WARN' ? 'warning' : c.type === 'BAN' || c.type === 'TEMPBAN' ? 'destructive' : 'secondary'}>
                          {c.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate font-mono text-xs">{c.targetUser.id}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{relativeTime(c.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
