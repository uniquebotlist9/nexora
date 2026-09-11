import Link from 'next/link';
import { Crown, Check } from 'lucide-react';
import { PLAN_LIMITS, type PlanTier } from '@nexora/types';
import { getGuildContext } from '@/lib/guild';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Premium' };

/** Feature rows compared across plans (keys of PlanLimits). */
const COMPARISON: { key: keyof typeof PLAN_LIMITS.FREE; label: string; format?: (v: unknown) => string }[] = [
  { key: 'automations', label: 'Automations' },
  { key: 'customCommands', label: 'Custom commands' },
  { key: 'autoModRules', label: 'AutoMod rules' },
  { key: 'backups', label: 'Stored backups' },
  { key: 'giveaways', label: 'Running giveaways' },
  { key: 'reactionRoleMessages', label: 'Role menus' },
  { key: 'ticketTypes', label: 'Ticket types' },
  { key: 'analyticsRetentionDays', label: 'Analytics retention (days)' },
  { key: 'scheduledJobs', label: 'Scheduled jobs' },
  { key: 'apiKeys', label: 'API keys' },
];

const BOOL_FEATURES: { key: keyof typeof PLAN_LIMITS.FREE; label: string }[] = [
  { key: 'ai', label: 'AI assistant & triage' },
  { key: 'welcomeCards', label: 'Welcome/goodbye image cards' },
  { key: 'customBranding', label: 'Custom branding' },
  { key: 'extendedLogs', label: 'Extended log retention' },
  { key: 'economy', label: 'Economy system' },
];

export default async function PremiumPage({ params }: { params: { guildId: string } }) {
  const ctx = await getGuildContext(params.guildId);
  if (!ctx.ok) return null;
  const { guild, plan } = ctx;

  // Stripe availability is checked server-side; the key itself is never exposed.
  const billingConfigured = Boolean(process.env.STRIPE_SECRET_KEY);

  const tiers = Object.keys(PLAN_LIMITS) as PlanTier[];

  return (
    <div>
      <PageHeader
        title="Premium"
        description={`Plan and limits for ${guild.name}.`}
        breadcrumb={[{ label: guild.name, href: `/dashboard/g/${guild.id}` }, { label: 'Premium' }]}
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-400" aria-hidden="true" />
            Current plan: <span className="text-gradient">{plan}</span>
          </CardTitle>
          <CardDescription>
            {plan === 'FREE'
              ? 'You are on the free plan. Upgrade to unlock higher limits and AI features.'
              : 'Thanks for supporting Nexora! Your limits are active immediately.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {billingConfigured ? (
            <Link
              href="/#pricing"
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 focus-ring"
            >
              {plan === 'FREE' ? 'Upgrade' : 'Manage subscription'}
            </Link>
          ) : (
            <Badge variant="secondary">Online billing coming soon — contact sales@nexora.dev</Badge>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plan comparison</CardTitle>
          <CardDescription>Limits per server for each tier.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="p-2 text-left text-xs font-semibold uppercase text-muted-foreground">
                  Feature
                </th>
                {tiers.map((t) => (
                  <th
                    key={t}
                    scope="col"
                    className={`p-2 text-center text-xs font-semibold uppercase ${t === plan ? 'text-primary' : 'text-muted-foreground'}`}
                  >
                    {t}
                    {t === plan && <span className="ml-1">(current)</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.key} className="border-b border-border/60">
                  <th scope="row" className="p-2 text-left font-medium">
                    {row.label}
                  </th>
                  {tiers.map((t) => (
                    <td key={t} className={`p-2 text-center ${t === plan ? 'font-semibold text-primary' : ''}`}>
                      {PLAN_LIMITS[t][row.key] as number}
                    </td>
                  ))}
                </tr>
              ))}
              {BOOL_FEATURES.map((row) => (
                <tr key={row.key} className="border-b border-border/60">
                  <th scope="row" className="p-2 text-left font-medium">
                    {row.label}
                  </th>
                  {tiers.map((t) => (
                    <td key={t} className="p-2 text-center">
                      {PLAN_LIMITS[t][row.key] ? (
                        <Check className="mx-auto h-4 w-4 text-emerald-500" aria-label="Included" />
                      ) : (
                        <span className="text-muted-foreground" aria-label="Not included">
                          —
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
