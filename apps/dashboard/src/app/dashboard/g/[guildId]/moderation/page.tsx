import { prisma } from '@nexora/database';
import { Gavel, Search } from 'lucide-react';
import { getGuildContext } from '@/lib/guild';
import { loadChannels, parseJsonColumn } from '@/lib/guild-data';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ModerationConfigEditor } from './config-editor';
import { type EscalationConfig } from './actions';
import { relativeTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Moderation' };

function caseBadgeVariant(type: string) {
  if (type === 'BAN' || type === 'TEMPBAN' || type === 'SOFTBAN') return 'destructive' as const;
  if (type === 'WARN' || type === 'ESCALATION') return 'warning' as const;
  if (type === 'TIMEOUT' || type === 'MUTE' || type === 'LOCKDOWN') return 'secondary' as const;
  return 'outline' as const;
}

export default async function ModerationPage({ params }: { params: { guildId: string } }) {
  const ctx = await getGuildContext(params.guildId);
  if (!ctx.ok) return null;
  const { guild } = ctx;

  const [settings, cases, appeals, channels] = await Promise.all([
    prisma.guildSettings.findUnique({ where: { guildId: guild.id } }),
    prisma.moderationCase.findMany({
      where: { guildId: guild.id },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { appeal: true, targetUser: { select: { id: true } } },
    }),
    prisma.appeal.count({ where: { case: { guildId: guild.id }, status: 'PENDING' } }),
    loadChannels(guild.id),
  ]);

  const escalation = parseJsonColumn<EscalationConfig>(settings?.escalating, {
    steps: [],
    resetOnEscalate: true,
  });

  return (
    <div>
      <PageHeader
        title="Moderation"
        description="Cases, warnings and the automatic escalation ladder."
        breadcrumb={[{ label: guild.name, href: `/dashboard/g/${guild.id}` }, { label: 'Moderation' }]}
        actions={appeals > 0 ? <Badge variant="warning">{appeals} pending appeal{appeals > 1 ? 's' : ''}</Badge> : undefined}
      />

      <ModerationConfigEditor
        guildId={guild.id}
        initialConfig={{ steps: escalation.steps ?? [], resetOnEscalate: escalation.resetOnEscalate ?? true }}
        channels={channels}
        initialModLogChannel={settings?.modLogChannelId ?? null}
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent cases</CardTitle>
          <CardDescription>
            Latest 25 moderation cases. Filter and warn history tooling is available per case via
            the bot&apos;s <code className="rounded bg-muted px-1">/case</code> command; appeal
            status is tracked below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cases.length === 0 ? (
            <EmptyState
              icon={Gavel}
              title="No moderation cases yet"
              description="When moderators or AutoMod take action, cases are recorded here with evidence and appeal status."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Appeal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">#{c.caseNumber}</TableCell>
                    <TableCell>
                      <Badge variant={caseBadgeVariant(c.type)}>{c.type}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate font-mono text-xs">{c.targetUser.id}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-sm" title={c.reason}>{c.reason}</TableCell>
                    <TableCell>
                      {c.appeal ? (
                        <Badge variant={c.appeal.status === 'PENDING' ? 'warning' : c.appeal.status === 'APPROVED' ? 'success' : 'destructive'}>
                          {c.appeal.status}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.active ? 'secondary' : 'outline'}>{c.active ? 'Active' : 'Resolved'}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{relativeTime(c.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Warning lookup</CardTitle>
          <CardDescription>Per-user warning history with points and expiry.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Search}
            title="Look up a member"
            description="Open the Members page to inspect a member's warnings, XP, economy balance and tickets in one drawer."
            action={{ label: 'Open Members', href: `/dashboard/g/${guild.id}/members` }}
            className="border-0"
          />
        </CardContent>
      </Card>
    </div>
  );
}
