'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { grantSubscriptionPlanAction } from '@/lib/actions/subscriptions';
import { ALL_PLANS } from '@/lib/format';

export function GrantPlanForm() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [targetType, setTargetType] = React.useState<'guild' | 'user'>('guild');
  const [targetId, setTargetId] = React.useState('');
  const [plan, setPlan] = React.useState('PRO');
  const [days, setDays] = React.useState('30');
  const [open, setOpen] = React.useState(false);

  const targetLabel = targetType === 'guild' ? 'Guild ID' : 'User ID';
  const validId = /^\d{15,21}$/.test(targetId.trim());

  const onConfirm = () => {
    startTransition(async () => {
      const result = await grantSubscriptionPlanAction({
        targetType,
        targetId: targetId.trim(),
        plan,
        days: Number(days),
      });
      if (result.ok) {
        toast.success(result.message ?? 'Plan granted.');
        setOpen(false);
        setTargetId('');
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1.5 text-sm">
          <span className="text-muted-foreground">Target type</span>
          <Select
            value={targetType}
            onChange={(event) => setTargetType(event.target.value as 'guild' | 'user')}
          >
            <option value="guild">Guild</option>
            <option value="user">User</option>
          </Select>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="text-muted-foreground">{targetLabel}</span>
          <Input
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
            placeholder={targetType === 'guild' ? 'e.g. 934456321…' : 'e.g. 254715983…'}
            inputMode="numeric"
          />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="text-muted-foreground">Plan</span>
          <Select value={plan} onChange={(event) => setPlan(event.target.value)}>
            {ALL_PLANS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="text-muted-foreground">Duration (days)</span>
          <Input
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(event) => setDays(event.target.value)}
          />
        </label>
      </div>
      <div className="flex justify-end">
        <Button disabled={!validId || !days} onClick={() => setOpen(true)}>
          <Sparkles />
          Grant plan
        </Button>
      </div>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        loading={pending}
        title={`Grant ${plan} to this ${targetType}?`}
        description={
          <>
            Creates or updates an internal subscription ({plan}, {days} days) for {targetType}{' '}
            <code className="font-mono text-xs">{targetId.trim()}</code>. This is audit-logged.
          </>
        }
        confirmLabel="Grant plan"
        onConfirm={onConfirm}
      />
    </div>
  );
}
