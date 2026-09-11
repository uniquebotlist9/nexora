import Link from 'next/link';
import { Check, Minus } from 'lucide-react';
import { prisma } from '@nexora/database';
import { PLAN_LIMITS, PLAN_TIERS, type PlanTier } from '@nexora/types';
import { getSession } from '@/lib/guild';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { BillingSubscriptions, type SubscriptionView } from './billing-client';

export const metadata = { title: 'Billing' };
export const dynamic = 'force-dynamic';

/** Monthly display price per tier (mirrors the landing page pricing section). */
const PLAN_PRICES: Record<PlanTier, string> = {
  FREE: '$0',
  PRO: '$7',
  BUSINESS: '$19',
  ENTERPRISE: 'Custom',
};

interface LimitRow {
  label: string;
  value: (limits: (typeof PLAN_LIMITS)[PlanTier]) => string;
}

const LIMIT_ROWS: LimitRow[] = [
  { label: 'Automations', value: (l) => String(l.automations) },
  { label: 'Custom commands', value: (l) => String(l.customCommands) },
  { label: 'AutoMod rules', value: (l) => String(l.autoModRules) },
  { label: 'Backups', value: (l) => String(l.backups) },
  { label: 'Scheduled jobs', value: (l) => String(l.scheduledJobs) },
  { label: 'Giveaways', value: (l) => String(l.giveaways) },
  { label: 'Reaction role messages', value: (l) => String(l.reactionRoleMessages) },
  { label: 'Ticket types', value: (l) => String(l.ticketTypes) },
  { label: 'Analytics retention', value: (l) => `${l.analyticsRetentionDays} days` },
  { label: 'API keys (per user)', value: (l) => String(l.apiKeys) },
];

const FEATURE_ROWS: { label: string; key: 'ai' | 'welcomeCards' | 'customBranding' | 'extendedLogs' | 'economy' }[] = [
  { label: 'AI assistant & ticket triage', key: 'ai' },
  { label: 'Welcome image cards', key: 'welcomeCards' },
  { label: 'Custom branding', key: 'customBranding' },
  { label: 'Extended log retention', key: 'extendedLogs' },
  { label: 'Economy system', key: 'economy' },
];

export default async function BillingPage() {
  const session = await getSession();
  if (!session?.user?.id) return null; // the (account) layout enforces auth

  const subscriptions = await prisma.subscription.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  });

  // Resolve a display name for each guild subscription: prefer the live guild
  // list from the session; fall back to the bot-synced Guild row for servers
  // the user can no longer manage.
  const guildIds = subscriptions
    .map((s) => s.guildId)
    .filter((id): id is string => id !== null);
  const guildRows = guildIds.length
    ? await prisma.guild.findMany({ where: { id: { in: guildIds } }, select: { id: true, name: true } })
    : [];
  const guildNames = new Map(guildRows.map((g) => [g.id, g.name]));
  const manageable = new Set((session.guilds ?? []).map((g) => g.guildId));

  // Guild subscriptions first, then user-level ones.
  const ordered = [...subscriptions].sort((a, b) => {
    if (a.guildId === null && b.guildId !== null) return 1;
    if (a.guildId !== null && b.guildId === null) return -1;
    return 0;
  });

  const views: SubscriptionView[] = ordered.map((s) => ({
    id: s.id,
    guildId: s.guildId,
    guildName: s.guildId ? (guildNames.get(s.guildId) ?? null) : null,
    manageable: s.guildId !== null && manageable.has(s.guildId),
    plan: s.plan,
    status: s.status,
    provider: s.provider,
    currentPeriodEnd: s.currentPeriodEnd ? s.currentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Billing"
        description="Your subscriptions, plan limits and upgrade options. Prices are per server, per month."
      />

      <section aria-label="Your subscriptions">
        <BillingSubscriptions subscriptions={views} />
      </section>

      <section aria-label="Plan comparison">
        <Card>
          <CardHeader>
            <CardTitle>Compare plans</CardTitle>
            <CardDescription>
              Every limit below is enforced by the bot and the API — upgrading a server applies the
              new limits immediately.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-56">Feature</TableHead>
                  {PLAN_TIERS.map((tier) => (
                    <TableHead key={tier} className="text-center">
                      <span className="flex flex-col items-center gap-1">
                        <span className="font-semibold">{tier}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {PLAN_PRICES[tier]}
                          {tier !== 'ENTERPRISE' ? ' /mo' : ''}
                        </span>
                        {tier === 'PRO' && <Badge>Most popular</Badge>}
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {LIMIT_ROWS.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    {PLAN_TIERS.map((tier) => (
                      <TableCell key={tier} className="text-center">
                        {row.value(PLAN_LIMITS[tier])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {FEATURE_ROWS.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    {PLAN_TIERS.map((tier) => {
                      const included = PLAN_LIMITS[tier][row.key];
                      return (
                        <TableCell key={tier} className="text-center">
                          {included ? (
                            <Check className="mx-auto h-4 w-4 text-emerald-500" aria-label="Included" />
                          ) : (
                            <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" aria-label="Not included" />
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium">Priority support &amp; SLA</TableCell>
                  {PLAN_TIERS.map((tier) => (
                    <TableCell key={tier} className="text-center">
                      {tier === 'ENTERPRISE' ? (
                        <Check className="mx-auto h-4 w-4 text-emerald-500" aria-label="Included" />
                      ) : (
                        <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" aria-label="Not included" />
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <p className="mt-3 text-sm text-muted-foreground">
          Need something custom at scale?{' '}
          <a
            href="mailto:sales@nexora.dev"
            className="text-primary underline-offset-4 hover:underline focus-ring"
          >
            Contact sales
          </a>{' '}
          about the ENTERPRISE tier, or{' '}
          <Link href="/#pricing" className="text-primary underline-offset-4 hover:underline focus-ring">
            see the full plan overview
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
