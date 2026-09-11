import { format } from 'date-fns';
import { CalendarDays, KeyRound, ServerCog, Sparkles } from 'lucide-react';
import { prisma } from '@nexora/database';
import { isPlanTier, limitsForPlan } from '@nexora/types';
import { getSession } from '@/lib/guild';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { PlanGate } from '@/components/shared/plan-gate';
import { CopyButton } from '@/components/shared/copy-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ApiKeysClient } from './api-keys-client';
import type { ApiKeyView } from './actions';

export const metadata = { title: 'Profile' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = await getSession();
  if (!session?.user?.id) return null; // the (account) layout enforces auth

  const [userRow, keys] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { createdAt: true, lastSeenAt: true },
    }),
    prisma.apiKey.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // User plan = the most recently updated active user-level subscription
  // (same resolution rule as the API package uses for key creation limits).
  const userSub = await prisma.subscription.findFirst({
    where: { guildId: null, userId: session.user.id, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    select: { plan: true },
  });
  const plan = userSub && isPlanTier(userSub.plan) ? userSub.plan : 'FREE';
  const limits = limitsForPlan(plan);

  const keyViews: ApiKeyView[] = keys.map((k) => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scopes: k.scopes,
    rateLimitPerMinute: k.rateLimitPerMinute,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
  }));
  const activeKeys = keyViews.filter((k) => !k.revokedAt).length;

  const initials = (session.user.name ?? session.user.email ?? '?').slice(0, 1).toUpperCase();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Profile"
        description="Your Nexora account, personal plan and developer access."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Servers you manage" value={session.guilds?.length ?? 0} icon={ServerCog} />
        <StatCard label="Personal plan" value={plan} icon={Sparkles} />
        <StatCard
          label="Active API keys"
          value={`${activeKeys}/${limits.apiKeys}`}
          icon={KeyRound}
          trend={limits.apiKeys === 0 ? 'Not available on FREE' : undefined}
          trendPositive={false}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Synced from your Discord account at sign-in.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-5">
          <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#5865F2] to-[#8B5CF6] text-xl font-bold text-white">
            {session.user.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- Discord avatar, fixed size
              <img src={session.user.image} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </span>
          <div className="space-y-1.5">
            <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
              {session.user.name ?? 'Discord user'}
              {plan !== 'FREE' && <Badge>{plan}</Badge>}
            </p>
            {session.user.email && (
              <p className="text-sm text-muted-foreground">{session.user.email}</p>
            )}
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono">{session.user.id}</span>
              <CopyButton text={session.user.id} label="Copy ID" />
            </p>
            {userRow && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                Member since {format(userRow.createdAt, 'd MMM yyyy')}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <section aria-label="Developer API keys" className="space-y-3">
        <PlanGate
          locked={limits.apiKeys <= 0}
          feature="Developer API keys"
          requiredPlan="PRO"
        >
          <ApiKeysClient initialKeys={keyViews} maxKeys={limits.apiKeys} plan={plan} />
        </PlanGate>
        <p className="text-sm text-muted-foreground">
          Key creation is tied to your <strong>personal</strong> plan ({limits.apiKeys} key
          {limits.apiKeys === 1 ? '' : 's'} on {plan}). Guild-level subscriptions unlock bot features
          per server, but not API keys.
        </p>
      </section>
    </div>
  );
}
