'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form';
import type { GuildOption } from '@/components/shared/guild-selects';
import { ChannelSelect, RoleSelect } from '@/components/shared/guild-selects';
import { upsertGuildConfig } from '@/app/dashboard/g/[guildId]/_lib/config-actions';

export interface VerificationState {
  enabled: boolean;
  mode: string;
  channelId: string | null;
  roleId: string | null;
  unverifiedRoleId: string | null;
  minAccountAgeHours: number;
  timeoutMinutes: number;
  kickOnTimeout: boolean;
  attemptsAllowed: number;
}

export function VerificationEditor({
  guildId,
  initial,
  roles,
  channels,
}: {
  guildId: string;
  initial: VerificationState;
  roles: GuildOption[];
  channels: GuildOption[];
}) {
  const [state, setState] = React.useState<VerificationState>(initial);
  const [saving, setSaving] = React.useState(false);
  const patch = (p: Partial<VerificationState>) => setState((s) => ({ ...s, ...p }));

  const save = async () => {
    setSaving(true);
    const result = await upsertGuildConfig(guildId, 'verification', {
      enabled: state.enabled,
      mode: state.mode,
      channelId: state.channelId,
      roleId: state.roleId,
      unverifiedRoleId: state.unverifiedRoleId,
      minAccountAgeHours: state.minAccountAgeHours,
      timeoutMinutes: state.timeoutMinutes,
      kickOnTimeout: state.kickOnTimeout,
      attemptsAllowed: state.attemptsAllowed,
    });
    setSaving(false);
    if (result.ok) toast.success('Verification settings saved');
    else toast.error(result.error);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Verification gate
          <Switch
            checked={state.enabled}
            onCheckedChange={(enabled) => patch({ enabled })}
            aria-label="Enable verification"
          />
        </CardTitle>
        <CardDescription>
          New members must verify before they can interact. Unverified members only see the
          verification channel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Mode" htmlFor="v-mode">
            <Select
              id="v-mode"
              options={[
                { value: 'BUTTON', label: 'Button click' },
                { value: 'CAPTCHA', label: 'Captcha' },
                { value: 'REACTION', label: 'Reaction' },
              ]}
              value={state.mode}
              onChange={(e) => patch({ mode: e.target.value })}
            />
          </FormField>
          <FormField label="Verification channel" htmlFor="v-channel">
            <ChannelSelect
              id="v-channel"
              channels={channels}
              onlyText
              value={state.channelId}
              onChange={(channelId) => patch({ channelId: channelId ?? null })}
              placeholder="No channel"
            />
          </FormField>
          <FormField label="Verified role" htmlFor="v-role" hint="Granted after successful verification.">
            <RoleSelect
              id="v-role"
              roles={roles}
              value={state.roleId}
              onChange={(roleId) => patch({ roleId: roleId ?? null })}
              placeholder="No role"
            />
          </FormField>
          <FormField label="Unverified role" htmlFor="v-unverified" hint="Held until verification completes.">
            <RoleSelect
              id="v-unverified"
              roles={roles}
              value={state.unverifiedRoleId}
              onChange={(unverifiedRoleId) => patch({ unverifiedRoleId: unverifiedRoleId ?? null })}
              placeholder="No role"
            />
          </FormField>
          <FormField label="Min account age (hours)" htmlFor="v-age" hint="Accounts younger than this are rejected.">
            <Input
              id="v-age"
              type="number"
              min={0}
              value={state.minAccountAgeHours}
              onChange={(e) => patch({ minAccountAgeHours: Number(e.target.value) || 0 })}
            />
          </FormField>
          <FormField label="Timeout (minutes)" htmlFor="v-timeout" hint="Time allowed to verify.">
            <Input
              id="v-timeout"
              type="number"
              min={1}
              value={state.timeoutMinutes}
              onChange={(e) => patch({ timeoutMinutes: Number(e.target.value) || 60 })}
            />
          </FormField>
          <FormField label="Attempts allowed" htmlFor="v-attempts">
            <Input
              id="v-attempts"
              type="number"
              min={1}
              max={10}
              value={state.attemptsAllowed}
              onChange={(e) => patch({ attemptsAllowed: Number(e.target.value) || 3 })}
            />
          </FormField>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border p-4">
          <div>
            <p className="text-sm font-medium">Kick on timeout</p>
            <p className="text-xs text-muted-foreground">
              Members who fail to verify in time are kicked instead of keeping the unverified role.
            </p>
          </div>
          <Switch
            checked={state.kickOnTimeout}
            onCheckedChange={(kickOnTimeout) => patch({ kickOnTimeout })}
            aria-label="Kick on timeout"
          />
        </div>

        <Button onClick={save} loading={saving} className="w-full sm:w-auto">
          <Save className="h-4 w-4" /> Save settings
        </Button>
      </CardContent>
    </Card>
  );
}
