'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pause, Play, ShieldOff, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  addGuildNoteAction,
  grantGuildPremiumAction,
  revokeGuildPremiumAction,
  toggleGuildActiveAction,
} from '@/lib/actions/guilds';
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

export function ToggleActiveButton({ guildId, active }: { guildId: string; active: boolean }) {
  const [open, setOpen] = React.useState(false);
  const { pending, run } = useAction();

  return (
    <>
      <Button variant={active ? 'outline' : 'default'} onClick={() => setOpen(true)}>
        {active ? <Pause /> : <Play />}
        {active ? 'Pause bot' : 'Resume bot'}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        loading={pending}
        destructive={active}
        title={active ? 'Pause this guild?' : 'Resume this guild?'}
        description={
          active
            ? 'The guild will be flagged inactive (soft pause). No data is removed; you can resume it at any time.'
            : 'The guild will be flagged active again.'
        }
        confirmLabel={active ? 'Pause guild' : 'Resume guild'}
        onConfirm={() => run(() => toggleGuildActiveAction(guildId), () => setOpen(false))}
      />
    </>
  );
}

interface PremiumManagerProps {
  guildId: string;
  plan: string | null;
  status: string | null;
  periodEnd: string | null;
}

export function PremiumManager({ guildId, plan, status, periodEnd }: PremiumManagerProps) {
  const [revokeOpen, setRevokeOpen] = React.useState(false);
  const [grantOpen, setGrantOpen] = React.useState(false);
  const [grantPlan, setGrantPlan] = React.useState<string>('PRO');
  const [days, setDays] = React.useState('30');
  const { pending, run } = useAction();

  return (
    <div className="space-y-4">
      {plan ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background/40 px-3 py-2.5">
          <p className="text-sm">
            Current plan: <span className="font-medium">{plan}</span>
            {status ? <span className="text-muted-foreground"> · {status}</span> : null}
            {periodEnd ? (
              <span className="text-muted-foreground"> · renews {periodEnd}</span>
            ) : null}
          </p>
          <Button variant="destructive" size="sm" onClick={() => setRevokeOpen(true)}>
            <ShieldOff />
            Revoke premium
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-[140px] space-y-1.5 text-sm">
          <span className="text-muted-foreground">Plan</span>
          <Select value={grantPlan} onChange={(event) => setGrantPlan(event.target.value)}>
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
        <Button onClick={() => setGrantOpen(true)}>
          <Sparkles />
          {plan ? 'Change plan' : 'Grant premium'}
        </Button>
      </div>

      <ConfirmDialog
        open={grantOpen}
        onOpenChange={setGrantOpen}
        loading={pending}
        title={`${plan ? 'Change plan' : 'Grant premium'} to ${grantPlan}?`}
        description={`Creates or updates an internal subscription (${grantPlan}) for ${days} days. This is audit-logged.`}
        confirmLabel="Grant plan"
        onConfirm={() =>
          run(
            () => grantGuildPremiumAction(guildId, grantPlan, Number(days)),
            () => setGrantOpen(false),
          )
        }
      />
      <ConfirmDialog
        open={revokeOpen}
        onOpenChange={setRevokeOpen}
        loading={pending}
        destructive
        title="Revoke premium?"
        description={`The guild's ${plan ?? 'premium'} subscription will be marked CANCELLED immediately. This is audit-logged.`}
        confirmLabel="Revoke premium"
        onConfirm={() => run(() => revokeGuildPremiumAction(guildId), () => setRevokeOpen(false))}
      />
    </div>
  );
}

export function GuildNoteForm({ guildId }: { guildId: string }) {
  const [note, setNote] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const { pending, run } = useAction();

  return (
    <div className="space-y-2">
      <Textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Internal staff note (visible to staff only)…"
        maxLength={2000}
      />
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" disabled={!note.trim()} onClick={() => setOpen(true)}>
          Add note
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        loading={pending}
        title="Add staff note?"
        description="The note is stored on the guild's audit trail and visible to all staff."
        confirmLabel="Add note"
        onConfirm={() =>
          run(
            () => addGuildNoteAction(guildId, note).then((result) => {
                if (result.ok) setNote('');
                return result;
              }),
            () => setOpen(false),
          )
        }
      />
    </div>
  );
}
