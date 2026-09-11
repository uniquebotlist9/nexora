'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  saveEscalationConfig, saveModLogChannel,
  type EscalationConfig, type EscalationStep,
} from '@/app/dashboard/g/[guildId]/moderation/actions';
import type { GuildOption } from '@/components/shared/guild-selects';
import { ChannelSelect } from '@/components/shared/guild-selects';

const ACTIONS: { value: EscalationStep['action']; label: string }[] = [
  { value: 'timeout', label: 'Timeout' },
  { value: 'kick', label: 'Kick' },
  { value: 'tempban', label: 'Temp-ban' },
  { value: 'ban', label: 'Ban' },
];

export function ModerationConfigEditor({
  guildId,
  initialConfig,
  channels,
  initialModLogChannel,
}: {
  guildId: string;
  initialConfig: EscalationConfig;
  channels: GuildOption[];
  initialModLogChannel: string | null;
}) {
  const [config, setConfig] = React.useState<EscalationConfig>(initialConfig);
  const [modLogChannel, setModLogChannel] = React.useState<string | undefined>(
    initialModLogChannel ?? undefined,
  );
  const [saving, setSaving] = React.useState(false);

  const updateStep = (index: number, patch: Partial<EscalationStep>) => {
    setConfig((c) => ({
      ...c,
      steps: c.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  };

  const move = (index: number, dir: -1 | 1) => {
    setConfig((c) => {
      const steps = [...c.steps];
      const target = index + dir;
      if (target < 0 || target >= steps.length) return c;
      [steps[index], steps[target]] = [steps[target]!, steps[index]!];
      return { ...c, steps };
    });
  };

  const save = async () => {
    setSaving(true);
    const result = await saveEscalationConfig(guildId, config);
    setSaving(false);
    if (result.ok) toast.success('Escalation ladder saved');
    else toast.error(result.error);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Escalation ladder</CardTitle>
          <CardDescription>
            When a member accumulates this many active warnings, the action fires automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {config.steps.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No escalation steps — warnings accumulate without automatic action.
            </p>
          )}
          {config.steps.map((step, i) => (
            <div
              key={i}
              className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-3"
            >
              <div className="w-24">
                <label htmlFor={`step-warnings-${i}`} className="mb-1 block text-xs font-medium text-muted-foreground">
                  Warnings
                </label>
                <Input
                  id={`step-warnings-${i}`}
                  type="number"
                  min={1}
                  max={100}
                  value={step.warnings}
                  onChange={(e) => updateStep(i, { warnings: Number(e.target.value) || 1 })}
                />
              </div>
              <div className="w-36">
                <label htmlFor={`step-action-${i}`} className="mb-1 block text-xs font-medium text-muted-foreground">
                  Action
                </label>
                <Select
                  id={`step-action-${i}`}
                  options={ACTIONS}
                  value={step.action}
                  onChange={(e) => updateStep(i, { action: e.target.value as EscalationStep['action'] })}
                />
              </div>
              {(step.action === 'timeout' || step.action === 'tempban') && (
                <div className="w-32">
                  <label htmlFor={`step-duration-${i}`} className="mb-1 block text-xs font-medium text-muted-foreground">
                    Minutes
                  </label>
                  <Input
                    id={`step-duration-${i}`}
                    type="number"
                    min={1}
                    value={step.durationMinutes ?? 60}
                    onChange={(e) => updateStep(i, { durationMinutes: Number(e.target.value) || 1 })}
                  />
                </div>
              )}
              <div className="ml-auto flex gap-0.5">
                <Button variant="ghost" size="icon" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Move step ${i + 1} down`} disabled={i === config.steps.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove step ${i + 1}`}
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setConfig((c) => ({ ...c, steps: c.steps.filter((_, j) => j !== i) }))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={config.steps.length >= 10}
              onClick={() =>
                setConfig((c) => ({
                  ...c,
                  steps: [...c.steps, { warnings: c.steps.length + 2, action: 'timeout', durationMinutes: 60 }],
                }))
              }
            >
              <Plus className="h-3.5 w-3.5" /> Add step
            </Button>
            <div className="flex items-center gap-2">
              <Switch
                id="reset-on-escalate"
                checked={config.resetOnEscalate}
                onCheckedChange={(resetOnEscalate) => setConfig((c) => ({ ...c, resetOnEscalate }))}
              />
              <label htmlFor="reset-on-escalate" className="text-sm">
                Reset warnings after escalating
              </label>
            </div>
            <Button onClick={save} loading={saving} disabled={config.steps.length >= 11}>
              <Save className="h-4 w-4" /> Save ladder
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mod-log channel</CardTitle>
          <CardDescription>Where the bot posts moderation case summaries.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ChannelSelect
            channels={channels}
            value={modLogChannel}
            onChange={setModLogChannel}
            onlyText
            placeholder="No mod-log channel"
          />
          <Button
            variant="secondary"
            className="w-full"
            onClick={async () => {
              const result = await saveModLogChannel(guildId, modLogChannel);
              if (result.ok) toast.success('Mod-log channel saved');
              else toast.error(result.error);
            }}
          >
            Save channel
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
