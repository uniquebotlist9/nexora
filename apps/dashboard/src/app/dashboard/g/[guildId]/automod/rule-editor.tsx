'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Bot, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { FormField } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { PlanGate } from '@/components/shared/plan-gate';
import type { GuildOption } from '@/components/shared/guild-selects';
import { RoleMultiSelect, ChannelMultiSelect } from '@/components/shared/guild-selects';
import {
  createAutoModRule, updateAutoModRule, deleteAutoModRule, toggleAutoModRule,
  type AutoModRuleInput,
} from './actions';

export interface AutoModRuleView {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  trigger: Record<string, unknown>;
  actions: { type: string; durationMinutes?: number; roleId?: string; points?: number }[];
  exemptRoleIds: string[];
  exemptChannelIds: string[];
  strikeCount: number;
}

const RULE_TYPES = [
  'SPAM', 'FLOOD', 'DUPLICATE', 'MENTION_SPAM', 'MASS_MENTION', 'EXCESSIVE_CAPS',
  'EXCESSIVE_EMOJI', 'INVITE', 'URL', 'PHISHING', 'BAD_WORDS', 'NSFW', 'RAID',
  'ACCOUNT_AGE', 'ATTACHMENT', 'BOT_ABUSE',
] as const;

const ACTION_TYPES = ['DELETE', 'WARN', 'TIMEOUT', 'KICK', 'BAN', 'ADD_ROLE', 'REMOVE_ROLE', 'ALERT_MODS'] as const;

/** Trigger fields shown per rule type (subset of autoModTriggerSchema). */
const TRIGGER_FIELDS: Partial<Record<string, { key: string; label: string; min: number; max: number }[]>> = {
  SPAM: [{ key: 'threshold', label: 'Messages per window', min: 1, max: 100 }, { key: 'windowSeconds', label: 'Window (seconds)', min: 1, max: 600 }],
  FLOOD: [{ key: 'threshold', label: 'Messages per window', min: 1, max: 100 }, { key: 'windowSeconds', label: 'Window (seconds)', min: 1, max: 600 }],
  DUPLICATE: [{ key: 'threshold', label: 'Repeats allowed', min: 1, max: 50 }, { key: 'windowSeconds', label: 'Window (seconds)', min: 1, max: 600 }],
  MENTION_SPAM: [{ key: 'threshold', label: 'Mentions per message', min: 1, max: 50 }],
  MASS_MENTION: [{ key: 'threshold', label: 'Mentions per message', min: 1, max: 50 }],
  EXCESSIVE_CAPS: [{ key: 'capsPercent', label: 'Caps percentage', min: 10, max: 100 }],
  EXCESSIVE_EMOJI: [{ key: 'maxEmojis', label: 'Max emojis', min: 1, max: 100 }],
  ATTACHMENT: [{ key: 'maxAttachments', label: 'Max attachments', min: 1, max: 20 }],
  ACCOUNT_AGE: [{ key: 'minAccountAgeHours', label: 'Min account age (hours)', min: 0, max: 100000 }],
  RAID: [{ key: 'joinThreshold', label: 'Joins per window', min: 2, max: 1000 }, { key: 'windowSeconds', label: 'Window (seconds)', min: 1, max: 3600 }],
  BAD_WORDS: [],
  INVITE: [],
  URL: [],
  PHISHING: [],
  NSFW: [],
  BOT_ABUSE: [],
};

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function AutoModRules({
  guildId,
  rules,
  roles,
  channels,
  limit,
  ruleCount,
}: {
  guildId: string;
  rules: AutoModRuleView[];
  roles: GuildOption[];
  channels: GuildOption[];
  limit: number;
  ruleCount: number;
}) {
  const [editing, setEditing] = React.useState<AutoModRuleView | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<AutoModRuleView | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const overLimit = ruleCount >= limit;

  const handleToggle = async (rule: AutoModRuleView, enabled: boolean) => {
    setBusyId(rule.id);
    const result = await toggleAutoModRule(guildId, rule.id, enabled);
    setBusyId(null);
    if (!result.ok) toast.error(result.error);
  };

  const handleDelete = async (rule: AutoModRuleView) => {
    const result = await deleteAutoModRule(guildId, rule.id);
    if (result.ok) toast.success(`Rule "${rule.name}" deleted`);
    else toast.error(result.error);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{ruleCount}</span> of {limit} rules used
          (current plan)
        </p>
        <Button
          variant="gradient"
          size="sm"
          disabled={overLimit}
          onClick={() => setCreating(true)}
          title={overLimit ? 'Plan limit reached — upgrade for more rules' : undefined}
        >
          <Plus className="h-4 w-4" /> New rule
        </Button>
      </div>

      {rules.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No AutoMod rules yet"
          description="Rules scan every message and join, then run your configured actions automatically — spam, invites, phishing and more."
          action={overLimit ? undefined : undefined}
        />
      ) : (
        <div className="grid gap-3">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{rule.name}</p>
                    <Badge variant="outline">{rule.type}</Badge>
                    {rule.strikeCount > 0 && (
                      <Badge variant="warning">{rule.strikeCount} strikes</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {rule.actions.map((a) => a.type).join(' → ')}
                  </p>
                </div>
                <Switch
                  checked={rule.enabled}
                  onCheckedChange={(enabled) => handleToggle(rule, enabled)}
                  disabled={busyId === rule.id}
                  aria-label={`Enable ${rule.name}`}
                />
                <Button variant="ghost" size="icon" aria-label={`Edit ${rule.name}`} onClick={() => setEditing(rule)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${rule.name}`}
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleting(rule)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        title={editing ? `Edit "${editing.name}"` : 'New AutoMod rule'}
        description="Configure the trigger, actions and exemptions. The bot enforces changes immediately."
        className="max-w-2xl"
      >
        <RuleForm
          key={editing?.id ?? 'new'}
          guildId={guildId}
          initial={editing ?? undefined}
          roles={roles}
          channels={channels}
          onDone={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="The rule stops applying immediately. Historical strikes are kept."
        confirmLabel="Delete rule"
        destructive
        onConfirm={() => deleting && handleDelete(deleting)}
      />
    </div>
  );
}

function RuleForm({
  guildId,
  initial,
  roles,
  channels,
  onDone,
}: {
  guildId: string;
  initial?: AutoModRuleView;
  roles: GuildOption[];
  channels: GuildOption[];
  onDone: () => void;
}) {
  const [name, setName] = React.useState(initial?.name ?? '');
  const [type, setType] = React.useState<string>(initial?.type ?? 'SPAM');
  const [trigger, setTrigger] = React.useState<Record<string, number | string>>(
    (initial?.trigger as Record<string, number | string>) ?? {},
  );
  const [words, setWords] = React.useState<string>(
    Array.isArray(trigger.words) ? (trigger.words as string[]).join(', ') : '',
  );
  const [actions, setActions] = React.useState(
    initial?.actions ?? [{ type: 'DELETE' as const }],
  );
  const [exemptRoleIds, setExemptRoleIds] = React.useState<string[]>(initial?.exemptRoleIds ?? []);
  const [exemptChannelIds, setExemptChannelIds] = React.useState<string[]>(initial?.exemptChannelIds ?? []);
  const [saving, setSaving] = React.useState(false);

  const triggerFields = TRIGGER_FIELDS[type] ?? [];

  const buildInput = (): AutoModRuleInput => {
    const t: Record<string, unknown> = {};
    for (const f of triggerFields) {
      const v = num(trigger[f.key], -1);
      if (v >= 0) t[f.key] = v;
    }
    if (type === 'BAD_WORDS' && words.trim()) {
      t.words = words.split(',').map((w) => w.trim()).filter(Boolean);
    }
    return {
      name,
      type,
      enabled: true,
      trigger: t,
      actions: actions.map((a) => ({
        type: a.type,
        ...(a.durationMinutes ? { durationMinutes: a.durationMinutes } : {}),
        ...(a.roleId ? { roleId: a.roleId } : {}),
        ...(a.points ? { points: a.points } : {}),
      })),
      exemptRoleIds,
      exemptChannelIds,
    };
  };

  const submit = async () => {
    setSaving(true);
    const input = buildInput();
    const result = initial
      ? await updateAutoModRule(guildId, initial.id, input)
      : await createAutoModRule(guildId, input);
    setSaving(false);
    if (result.ok) {
      toast.success(initial ? 'Rule updated' : 'Rule created');
      onDone();
    } else {
      toast.error(result.error, {
        description: Object.values(result.fieldErrors ?? {})[0],
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Rule name" htmlFor="rule-name" required>
          <Input id="rule-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Anti-spam" maxLength={100} />
        </FormField>
        <FormField label="Rule type" htmlFor="rule-type" required>
          <Select
            id="rule-type"
            options={RULE_TYPES.map((t) => ({ value: t, label: t.replaceAll('_', ' ') }))}
            value={type}
            onChange={(e) => setType(e.target.value)}
          />
        </FormField>
      </div>

      <div className="rounded-xl border border-border p-4">
        <h4 className="mb-3 text-sm font-semibold">Trigger</h4>
        {triggerFields.length === 0 && type !== 'BAD_WORDS' && (
          <p className="text-sm text-muted-foreground">
            This rule type needs no extra configuration — it detects on its own heuristics.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {triggerFields.map((f) => (
            <FormField key={f.key} label={f.label} htmlFor={`trigger-${f.key}`}>
              <Input
                id={`trigger-${f.key}`}
                type="number"
                min={f.min}
                max={f.max}
                value={num(trigger[f.key], f.min)}
                onChange={(e) => setTrigger((t) => ({ ...t, [f.key]: Number(e.target.value) }))}
              />
            </FormField>
          ))}
          {type === 'BAD_WORDS' && (
            <FormField
              label="Blocked words"
              htmlFor="trigger-words"
              hint="Comma-separated. Max 500."
              className="sm:col-span-2"
            >
              <Input
                id="trigger-words"
                value={words}
                onChange={(e) => setWords(e.target.value)}
                placeholder="word1, word2, …"
              />
            </FormField>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border p-4">
        <h4 className="mb-3 text-sm font-semibold">Actions ({actions.length}/5)</h4>
        <div className="space-y-2">
          {actions.map((action, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Select
                options={ACTION_TYPES.map((t) => ({ value: t, label: t.replaceAll('_', ' ') }))}
                value={action.type}
                onChange={(e) =>
                  setActions((a) => a.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))
                }
                aria-label={`Action ${i + 1}`}
                className="w-40"
              />
              {action.type === 'TIMEOUT' && (
                <Input
                  type="number"
                  min={1}
                  placeholder="Minutes"
                  className="w-28"
                  value={action.durationMinutes ?? ''}
                  onChange={(e) =>
                    setActions((a) => a.map((x, j) => (j === i ? { ...x, durationMinutes: Number(e.target.value) || undefined } : x)))
                  }
                  aria-label={`Action ${i + 1} duration in minutes`}
                />
              )}
              {(action.type === 'ADD_ROLE' || action.type === 'REMOVE_ROLE') && (
                <Select
                  options={roles.map((r) => ({ value: r.id, label: `@${r.name}` }))}
                  value={action.roleId ?? ''}
                  onChange={(e) =>
                    setActions((a) => a.map((x, j) => (j === i ? { ...x, roleId: e.target.value || undefined } : x)))
                  }
                  placeholder="Select role"
                  aria-label={`Action ${i + 1} role`}
                  className="w-44"
                />
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove action ${i + 1}`}
                className="text-destructive hover:bg-destructive/10"
                disabled={actions.length <= 1}
                onClick={() => setActions((a) => a.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        {actions.length < 5 && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => setActions((a) => [...a, { type: 'DELETE' }])}
          >
            <Plus className="h-3.5 w-3.5" /> Add action
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Exempt roles" hint="Members with these roles are never checked.">
          <RoleMultiSelect roles={roles} value={exemptRoleIds} onChange={setExemptRoleIds} />
        </FormField>
        <FormField label="Exempt channels" hint="Messages in these channels are never checked.">
          <ChannelMultiSelect channels={channels} value={exemptChannelIds} onChange={setExemptChannelIds} />
        </FormField>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button onClick={submit} loading={saving} disabled={!name.trim() || actions.length === 0}>
          {initial ? 'Save changes' : 'Create rule'}
        </Button>
      </div>
    </div>
  );
}
