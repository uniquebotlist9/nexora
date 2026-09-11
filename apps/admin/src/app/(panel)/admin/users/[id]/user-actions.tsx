'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { KeyRound, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { revokeApiKeyAction } from '@/lib/actions/users';
import { grantSubscriptionPlanAction } from '@/lib/actions/subscriptions';
import { GRANTABLE_PREMIUM_PLANS } from '@/lib/format';
import type { ActionResult } from '@/lib/types';

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const run = React.useCallback(
    (invoke: () => Promise<ActionResult>, close: () => void) => {
      startTransition(async () => {
        const result = await invoke();
        if (result.ok) {
          toast.success(result.message ?? 'Done.');
          close();
          router.refresh();
        } else {
          toast.error(result.error);
        }
      });
    },
    [router],
  );
  return { pending, run };
}

/** Destructive: sets revokedAt on an API key. Always behind a confirm dialog. */
export function RevokeApiKeyButton({
  apiKeyId,
  name,
  prefix,
}: {
  apiKeyId: string;
  name: string;
  prefix: string;
}) {
  const [open, setOpen] = React.useState(false);
  const { pending, run } = useAction();

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <KeyRound />
        Revoke
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        loading={pending}
        destructive
        title={`Revoke API key "${name}"?`}
        description={`Key ${prefix}••••• will stop working immediately. This is irreversible and audit-logged.`}
        confirmLabel="Revoke key"
        onConfirm={() => run(() => revokeApiKeyAction(apiKeyId), () => setOpen(false))}
      />
    </>
  );
}

/** Manual premium grant for a user (creates/updates an internal Subscription). */
export function UserPremiumGrant({ userId }: { userId: string }) {
  const [open, setOpen] = React.useState(false);
  const [plan, setPlan] = React.useState<string>('PRO');
  const [days, setDays] = React.useState('30');
  const { pending, run } = useAction();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[140px] flex-1 space-y-1.5 text-sm">
          <span className="text-muted-foreground">Plan</span>
          <Select value={plan} onChange={(event) => setPlan(event.target.value)}>
            {GRANTABLE_PREMIUM_PLANS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </label>
        <label className="w-32 space-y-1.5 text-sm">
          <span className="text-muted-foreground">Duration (days)</span>
          <Input
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(event) => setDays(event.target.value)}
          />
        </label>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Sparkles />
          Grant plan
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        loading={pending}
        title={`Grant ${plan} to this user?`}
        description={`Creates or updates an internal ${plan} subscription for ${days} days. This is audit-logged.`}
        confirmLabel="Grant plan"
        onConfirm={() =>
          run(
            () =>
              grantSubscriptionPlanAction({
                targetType: 'user',
                targetId: userId,
                plan,
                days: Number(days),
              }),
            () => setOpen(false),
          )
        }
      />
    </div>
  );
}
