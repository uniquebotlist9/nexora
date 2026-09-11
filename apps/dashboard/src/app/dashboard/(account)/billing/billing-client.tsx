'use client';

import * as React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ArrowUpRight, CalendarClock, CreditCard, RefreshCcw, UserRound, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { setCancelAtPeriodEnd } from './actions';

export interface SubscriptionView {
  id: string;
  guildId: string | null;
  guildName: string | null;
  /** Whether the user can still open this guild in the dashboard. */
  manageable: boolean;
  plan: string;
  status: string;
  provider: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

function planBadgeVariant(plan: string): 'default' | 'secondary' {
  return plan === 'FREE' ? 'secondary' : 'default';
}

function statusBadgeVariant(status: string): 'success' | 'warning' | 'destructive' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'TRIALING' || status === 'PAST_DUE') return 'warning';
  return 'destructive';
}

/** Subscription cards with real cancel/resume actions. */
export function BillingSubscriptions({ subscriptions }: { subscriptions: SubscriptionView[] }) {
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<SubscriptionView | null>(null);

  function apply(sub: SubscriptionView, cancel: boolean) {
    setBusyId(sub.id);
    void (async () => {
      const result = await setCancelAtPeriodEnd(sub.id, cancel);
      if (result.ok) {
        toast.success(
          cancel
            ? `Cancellation scheduled — the ${sub.plan} plan stays active until the end of the period.`
            : `${sub.plan} plan will renew as usual.`,
        );
        setCancelTarget(null);
      } else {
        toast.error(result.error);
      }
      setBusyId(null);
    })();
  }

  if (subscriptions.length === 0) {
    return (
      <EmptyState
        icon={CreditCard}
        title="You are on the FREE plan"
        description="You have no active subscriptions. Upgrade a server to unlock automation, analytics and AI features."
        action={{ label: 'See plans', href: '/#pricing' }}
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {subscriptions.map((sub) => {
        const periodEnd = sub.currentPeriodEnd ? format(new Date(sub.currentPeriodEnd), 'd MMM yyyy') : null;
        const busy = busyId === sub.id;
        const cancellable = sub.plan !== 'FREE' && !sub.cancelAtPeriodEnd && sub.status !== 'CANCELED';
        return (
          <Card key={sub.id}>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    {sub.guildId ? (
                      <CreditCard className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <UserRound className="h-5 w-5" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{sub.guildName ?? 'Personal plan'}</p>
                    <p className="text-xs text-muted-foreground">
                      {sub.guildId ? 'Server subscription' : 'User-level subscription'} · via{' '}
                      {sub.provider === 'stripe' ? 'Stripe' : sub.provider}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant={planBadgeVariant(sub.plan)}>{sub.plan}</Badge>
                  <Badge variant={statusBadgeVariant(sub.status)}>{sub.status}</Badge>
                </div>
              </div>

              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
                {periodEnd
                  ? sub.cancelAtPeriodEnd
                    ? `Ends ${periodEnd} — will not renew`
                    : `Renews ${periodEnd}`
                  : 'No renewal date (manual plan)'}
              </p>

              {sub.cancelAtPeriodEnd && (
                <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                  Cancellation is scheduled. The plan stays active until the period ends, and you can
                  resume it any time before that.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {sub.plan === 'FREE' ? (
                  <Link
                    href="/#pricing"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-primary px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90 focus-ring"
                  >
                    Compare plans <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                ) : cancellable ? (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={busy}
                    onClick={() => setCancelTarget(sub)}
                  >
                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    Cancel at period end
                  </Button>
                ) : sub.cancelAtPeriodEnd ? (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={busy}
                    disabled={busyId !== null}
                    onClick={() => apply(sub, false)}
                  >
                    <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Resume subscription
                  </Button>
                ) : null}
                {sub.guildId && sub.manageable && (
                  <Link
                    href={`/dashboard/g/${sub.guildId}/premium`}
                    className="text-sm text-primary underline-offset-4 hover:underline focus-ring"
                  >
                    Manage in server
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        title="Cancel at period end?"
        description={
          cancelTarget
            ? `The ${cancelTarget.plan} plan for ${cancelTarget.guildName ?? 'your personal plan'} stays fully active until the end of the current billing period, then downgrades to FREE. You can resume any time before it ends.`
            : ''
        }
        confirmLabel="Schedule cancellation"
        onConfirm={() => {
          if (cancelTarget) apply(cancelTarget, true);
        }}
      />
    </div>
  );
}
