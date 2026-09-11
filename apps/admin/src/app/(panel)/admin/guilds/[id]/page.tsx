import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isPlanTier, limitsForPlan } from '@nexora/types';
import {
  Archive,
  ArrowLeft,
  Clock,
  Command,
  Gift,
  Gavel,
  ScrollText,
  Settings2,
  Shield,
  ShieldAlert,
  StickyNote,
  Ticket,
  Users,
  Workflow,
} from 'lucide-react';
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
import {
  GuildNoteForm,
  PremiumManager,
  ToggleActiveButton,
} from './guild-actions';
import { EmptyState } from '@/components/shared/empty-state';
import { JsonViewer } from '@/components/shared/json-viewer';
import { RoleGate } from '@/components/shared/role-gate';
import {
  ACTOR_TYPE_VARIANT,
  APPEAL_STATUS_VARIANT,
  CASE_TYPE_VARIANT,
  PLAN_VARIANT,
  TICKET_STATUS_VARIANT,
} from '@/lib/badges';
import { formatDateTime, formatNumber, formatRelative, truncate } from '@/lib/format';
import {
  canViewBilling,
  GUILD_DANGER_ROLES,
  SUBSCRIPTION_MUTATION_ROLES,
} from '@/lib/roles';
import { requirePage } from '@/lib/session';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function parseNote(metadata: unknown): string {
  if (metadata && typeof metadata === 'object' && 'note' in metadata) {
    const note = (metadata as { note?: unknown }).note;
    if (typeof note === 'string') return note;
  }
  return '';
}

export default async function GuildDetailPage({ params }: { params: { id: string } }) {
  const session = await requirePage('guilds');
  const role = session.user.adminRole;
  const showBilling = canViewBilling(role);

  const guild = await prisma.guild.findUnique({
    where: { id: params.id },
    include: {
      settings: true,
      _count: {
        select: {
          automations: true,
          customCommands: true,
          autoModRules: true,
          tickets: true,
          giveaways: true,
          backups: true,
          members: true,
          scheduledTasks: true,
        },
      },
    },
  });
  if (!guild) notFound();

  const [subscription, auditEntries, noteEntries, modCases, tickets] = await Promise.all([
    prisma.subscription.findFirst({
      where: { guildId: guild.id, status: { in: ['ACTIVE', 'TRIALING'] } },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.auditLog.findMany({
      where: { guildId: guild.id, action: { not: 'admin.guild.note' } },
      orderBy: { createdAt: 'desc' },
      take: 15,
    }),
    prisma.auditLog.findMany({
      where: { guildId: guild.id, action: 'admin.guild.note' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.moderationCase.findMany({
      where: { guildId: guild.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { appeal: true },
    }),
    prisma.ticket.findMany({
      where: { guildId: guild.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  const notes = noteEntries
    .map((entry) => ({ id: entry.id, note: parseNote(entry.metadata), meta: entry }))
    .filter((entry) => entry.note.length > 0);

  const settings = guild.settings;
  const effectivePlan =
    subscription && isPlanTier(subscription.plan) ? subscription.plan : 'FREE';
  const limits = limitsForPlan(effectivePlan);

  const usage = [
    { label: 'Automations', value: guild._count.automations, limit: limits.automations, icon: Workflow },
    { label: 'Custom commands', value: guild._count.customCommands, limit: limits.customCommands, icon: Command },
    { label: 'AutoMod rules', value: guild._count.autoModRules, limit: limits.autoModRules, icon: Shield },
    { label: 'Giveaways', value: guild._count.giveaways, limit: limits.giveaways, icon: Gift },
    { label: 'Backups', value: guild._count.backups, limit: limits.backups, icon: Archive },
    { label: 'Scheduled tasks', value: guild._count.scheduledTasks, limit: limits.scheduledJobs, icon: Clock },
    { label: 'Tickets (all time)', value: guild._count.tickets, limit: null, icon: Ticket },
    { label: 'Members tracked', value: guild._count.members, limit: null, icon: Users },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/guilds"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to guilds
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-lg font-semibold uppercase">
          {guild.name.slice(0, 2)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold tracking-tight">{guild.name}</h2>
            {guild.active ? (
              <Badge variant="success">Active</Badge>
            ) : (
              <Badge variant="warning">Paused</Badge>
            )}
            {showBilling ? (
              <Badge variant={PLAN_VARIANT[effectivePlan] ?? 'muted'}>{effectivePlan}</Badge>
            ) : null}
            {guild.botLeftAt ? <Badge variant="destructive">Bot left</Badge> : null}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-xs text-muted-foreground">
            <span>{guild.id}</span>
            <span>shard {guild.shardId}</span>
            <span>{formatNumber(guild.memberCount)} members</span>
            <span>joined {formatDateTime(guild.createdAt)}</span>
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Staff actions</CardTitle>
            <CardDescription>
              All actions require confirmation and are audit-logged.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RoleGate
              role={role}
              roles={GUILD_DANGER_ROLES}
              fallback={
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Danger zone requires OWNER or ADMINISTRATOR.
                </p>
              }
            >
              <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                  <ShieldAlert className="h-4 w-4" />
                  Danger zone
                </p>
                <ToggleActiveButton guildId={guild.id} active={guild.active} />
              </div>
            </RoleGate>

            {showBilling ? (
              <RoleGate role={role} roles={SUBSCRIPTION_MUTATION_ROLES}>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Premium controls</p>
                  <PremiumManager
                    guildId={guild.id}
                    plan={subscription?.plan ?? null}
                    status={subscription?.status ?? null}
                    periodEnd={
                      subscription?.currentPeriodEnd
                        ? formatDateTime(subscription.currentPeriodEnd)
                        : null
                    }
                  />
                </div>
              </RoleGate>
            ) : null}

            <RoleGate role={role} minRank="SUPPORT">
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <StickyNote className="h-4 w-4 text-muted-foreground" />
                  Internal note
                </p>
                <GuildNoteForm guildId={guild.id} />
              </div>
            </RoleGate>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feature usage vs plan limits</CardTitle>
            <CardDescription>
              Effective plan: <span className="font-medium">{effectivePlan}</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2.5">
              {usage.map((item) => {
                const overLimit = item.limit !== null && item.value > item.limit;
                const atLimit = item.limit !== null && item.value === item.limit;
                return (
                  <div key={item.label} className="rounded-md border bg-background/40 px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <item.icon className="h-3.5 w-3.5" />
                      {item.label}
                    </p>
                    <p
                      className={cn(
                        'mt-0.5 text-lg font-semibold',
                        overLimit && 'text-red-400',
                        atLimit && 'text-amber-400',
                      )}
                    >
                      {formatNumber(item.value)}
                      {item.limit !== null ? (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          / {formatNumber(item.limit)}
                        </span>
                      ) : null}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              Settings dump
            </CardTitle>
            <CardDescription>
              {settings ? 'Full GuildSettings row (raw)' : 'No settings row created yet'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {settings ? (
              <JsonViewer value={settings} className="max-h-[420px]" />
            ) : (
              <p className="text-sm text-muted-foreground">
                This guild has no GuildSettings row yet — it will be created when the bot
                next syncs.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gavel className="h-4 w-4 text-primary" />
              Moderation cases
            </CardTitle>
            <CardDescription>Most recent 10 cases in this guild.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {modCases.length === 0 ? (
              <EmptyState
                icon={Gavel}
                title="No moderation cases"
                description="Cases appear here once moderators act in this guild."
                className="border-0"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">#</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Appeal</TableHead>
                    <TableHead className="pr-6">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modCases.map((modCase) => (
                    <TableRow key={modCase.id}>
                      <TableCell className="pl-6 font-mono text-xs">
                        {modCase.caseNumber}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          <Badge variant={CASE_TYPE_VARIANT[modCase.type] ?? 'muted'}>
                            {modCase.type}
                          </Badge>
                          {modCase.active ? null : (
                            <Badge variant="muted">resolved</Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell
                        className="font-mono text-xs text-muted-foreground"
                        title={modCase.targetUserId}
                      >
                        {truncate(modCase.targetUserId, 12)}
                      </TableCell>
                      <TableCell>
                        {modCase.appeal ? (
                          <Badge variant={APPEAL_STATUS_VARIANT[modCase.appeal.status] ?? 'muted'}>
                            {modCase.appeal.status}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap pr-6 text-xs text-muted-foreground">
                        {formatRelative(modCase.createdAt)}
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
              <Ticket className="h-4 w-4 text-primary" />
              Tickets
            </CardTitle>
            <CardDescription>Most recent 10 tickets in this guild.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {tickets.length === 0 ? (
              <EmptyState
                icon={Ticket}
                title="No tickets"
                description="Tickets appear here once users open them in this guild."
                className="border-0"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">#</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead className="pr-6">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell className="pl-6 font-mono text-xs">{ticket.number}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm">
                        {ticket.subject || ticket.channelName}
                      </TableCell>
                      <TableCell>
                        <Badge variant={TICKET_STATUS_VARIANT[ticket.status] ?? 'muted'}>
                          {ticket.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {ticket.priority}
                      </TableCell>
                      <TableCell className="whitespace-nowrap pr-6 text-xs text-muted-foreground">
                        {formatRelative(ticket.createdAt)}
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
          <CardTitle className="flex items-center gap-2 text-base">
            <StickyNote className="h-4 w-4 text-primary" />
            Staff notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No staff notes yet.</p>
          ) : (
            <ul className="space-y-3">
              {notes.map((entry) => (
                <li key={entry.id} className="rounded-md border bg-background/40 px-3 py-2.5">
                  <p className="whitespace-pre-wrap text-sm">{entry.note}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {entry.meta.actorId ? `${entry.meta.actorId} · ` : ''}
                    {formatDateTime(entry.meta.createdAt)} ({formatRelative(entry.meta.createdAt)})
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4 text-primary" />
            Recent audit log
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {auditEntries.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="No audit entries"
              description="No audit activity recorded for this guild yet."
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="pr-6">Metadata</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditEntries.map((entry) => (
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
                          {truncate(entry.actorId, 12)}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {entry.targetType ? `${entry.targetType} ${truncate(entry.targetId, 10)}` : '—'}
                    </TableCell>
                    <TableCell className="max-w-[240px] pr-6">
                      <code
                        className="block truncate font-mono text-xs text-muted-foreground"
                        title={JSON.stringify(entry.metadata ?? {})}
                      >
                        {truncate(JSON.stringify(entry.metadata ?? {}), 40)}
                      </code>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
