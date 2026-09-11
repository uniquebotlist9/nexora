'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Save, Trash2, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form';
import { EmptyState } from '@/components/shared/empty-state';
import type { GuildOption } from '@/components/shared/guild-selects';
import { ChannelSelect, ChannelMultiSelect, RoleSelect } from '@/components/shared/guild-selects';
import { saveLevelConfig, type LevelConfigInput } from '@/app/dashboard/g/[guildId]/leveling/actions';

export function LevelingEditor({
  guildId,
  initial,
  roles,
  channels,
}: {
  guildId: string;
  initial: LevelConfigInput;
  roles: GuildOption[];
  channels: GuildOption[];
}) {
  const [state, setState] = React.useState<LevelConfigInput>(initial);
  const [saving, setSaving] = React.useState(false);
  const patch = (p: Partial<LevelConfigInput>) => setState((s) => ({ ...s, ...p }));

  const save = async () => {
    setSaving(true);
    const result = await saveLevelConfig(guildId, state);
    setSaving(false);
    if (result.ok) toast.success('Leveling settings saved');
    else toast.error(result.error, { description: Object.values(result.fieldErrors ?? {})[0] });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold">Leveling system</p>
            <p className="text-sm text-muted-foreground">XP for chatting, with rewards and announcements.</p>
          </div>
          <Switch checked={state.enabled} onCheckedChange={(enabled) => patch({ enabled })} aria-label="Enable leveling" />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>XP settings</CardTitle>
            <CardDescription>Per-message XP between min and max, gated by a cooldown.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <FormField label="XP min" htmlFor="lv-min">
              <Input id="lv-min" type="number" min={1} max={100} value={state.xpMin} onChange={(e) => patch({ xpMin: Number(e.target.value) || 1 })} />
            </FormField>
            <FormField label="XP max" htmlFor="lv-max">
              <Input id="lv-max" type="number" min={1} max={100} value={state.xpMax} onChange={(e) => patch({ xpMax: Number(e.target.value) || 1 })} />
            </FormField>
            <FormField label="Cooldown (s)" htmlFor="lv-cd">
              <Input id="lv-cd" type="number" min={0} max={3600} value={state.cooldownSeconds} onChange={(e) => patch({ cooldownSeconds: Number(e.target.value) || 0 })} />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Announcements</CardTitle>
            <CardDescription>Where and how level-ups are celebrated. Variables: {'{user}'}, {'{level}'}, {'{server}'}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField label="Announce channel" htmlFor="lv-channel">
              <ChannelSelect
                id="lv-channel"
                channels={channels}
                onlyText
                value={state.announceChannelId}
                onChange={(announceChannelId) => patch({ announceChannelId: announceChannelId ?? null })}
                placeholder="No channel (silent)"
              />
            </FormField>
            <FormField label="Announce template" htmlFor="lv-template">
              <Input id="lv-template" value={state.announceTemplate} onChange={(e) => patch({ announceTemplate: e.target.value })} maxLength={2000} />
            </FormField>
            <div className="flex items-center justify-between">
              <label htmlFor="lv-dm" className="text-sm font-medium">Also DM the member</label>
              <Switch id="lv-dm" checked={state.dmEnabled} onCheckedChange={(dmEnabled) => patch({ dmEnabled })} />
            </div>
            {state.dmEnabled && (
              <FormField label="DM template" htmlFor="lv-dmtemplate">
                <Input id="lv-dmtemplate" value={state.dmTemplate} onChange={(e) => patch({ dmTemplate: e.target.value })} maxLength={2000} />
              </FormField>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Role multipliers</CardTitle>
            <CardDescription>Members with these roles earn multiplied XP.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {state.multipliers.length === 0 && (
              <p className="text-sm text-muted-foreground">No multipliers — everyone earns base XP.</p>
            )}
            {state.multipliers.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1">
                  <RoleSelect
                    roles={roles}
                    value={m.roleId}
                    onChange={(roleId) =>
                      patch({ multipliers: state.multipliers.map((x, j) => (j === i ? { ...x, roleId: roleId ?? '' } : x)) })
                    }
                    placeholder="Select role"
                    allowEmpty={false}
                  />
                </div>
                <Input
                  type="number"
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={m.multiplier}
                  onChange={(e) =>
                    patch({ multipliers: state.multipliers.map((x, j) => (j === i ? { ...x, multiplier: Number(e.target.value) || 1 } : x)) })
                  }
                  aria-label={`Multiplier ${i + 1}`}
                  className="w-24"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove multiplier ${i + 1}`}
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => patch({ multipliers: state.multipliers.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              disabled={state.multipliers.length >= 20}
              onClick={() => patch({ multipliers: [...state.multipliers, { roleId: '', multiplier: 2 }] })}
            >
              <Plus className="h-3.5 w-3.5" /> Add multiplier
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Role rewards</CardTitle>
            <CardDescription>Roles granted when a level is reached.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {state.roleRewards.length === 0 && (
              <p className="text-sm text-muted-foreground">No rewards configured.</p>
            )}
            {state.roleRewards.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={r.level}
                  onChange={(e) =>
                    patch({ roleRewards: state.roleRewards.map((x, j) => (j === i ? { ...x, level: Number(e.target.value) || 1 } : x)) })
                  }
                  aria-label={`Reward ${i + 1} level`}
                  className="w-20"
                />
                <div className="min-w-[160px] flex-1">
                  <RoleSelect
                    roles={roles}
                    value={r.roleId}
                    onChange={(roleId) =>
                      patch({ roleRewards: state.roleRewards.map((x, j) => (j === i ? { ...x, roleId: roleId ?? '' } : x)) })
                    }
                    placeholder="Select role"
                    allowEmpty={false}
                  />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Switch
                    checked={r.keepPrevious}
                    onCheckedChange={(keepPrevious) =>
                      patch({ roleRewards: state.roleRewards.map((x, j) => (j === i ? { ...x, keepPrevious } : x)) })
                    }
                    aria-label={`Reward ${i + 1} keep previous`}
                  />
                  keep
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove reward ${i + 1}`}
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => patch({ roleRewards: state.roleRewards.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              disabled={state.roleRewards.length >= 50}
              onClick={() => patch({ roleRewards: [...state.roleRewards, { level: 5, roleId: '', keepPrevious: false }] })}
            >
              <Plus className="h-3.5 w-3.5" /> Add reward
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ignored channels</CardTitle>
          <CardDescription>No XP is earned in these channels.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChannelMultiSelect
            channels={channels}
            value={state.ignoreChannelIds}
            onChange={(ignoreChannelIds) => patch({ ignoreChannelIds })}
            placeholder="No ignored channels"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} loading={saving}>
          <Save className="h-4 w-4" /> Save settings
        </Button>
      </div>
    </div>
  );
}
