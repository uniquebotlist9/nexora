'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { ShieldAlert, Lock, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import type { GuildOption } from '@/components/shared/guild-selects';
import { ChannelSelect, RoleSelect } from '@/components/shared/guild-selects';
import { upsertGuildConfig } from '@/app/dashboard/g/[guildId]/_lib/config-actions';
import { relativeTime } from '@/lib/utils';

export interface AntiRaidState {
  enabled: boolean;
  joinThreshold: number;
  windowSeconds: number;
  minAccountAgeHours: number;
  action: string;
  quarantineRoleId: string | null;
  quarantineEnabled: boolean;
  verificationMode: boolean;
  autoLockdown: boolean;
  lockdownActive: boolean;
  autoRecover: boolean;
  alertChannelId: string | null;
  lastRaidAt: Date | null;
}

export function AntiRaidEditor({
  guildId,
  initial,
  roles,
  channels,
}: {
  guildId: string;
  initial: AntiRaidState;
  roles: GuildOption[];
  channels: GuildOption[];
}) {
  const [state, setState] = React.useState<AntiRaidState>(initial);
  const [saving, setSaving] = React.useState(false);
  const [lockdownConfirm, setLockdownConfirm] = React.useState(false);
  const [testMode, setTestMode] = React.useState(false);

  const patch = (p: Partial<AntiRaidState>) => setState((s) => ({ ...s, ...p }));

  const save = async () => {
    setSaving(true);
    const result = await upsertGuildConfig(
      guildId,
      'antiRaid',
      {
        enabled: state.enabled,
        joinThreshold: state.joinThreshold,
        windowSeconds: state.windowSeconds,
        minAccountAgeHours: state.minAccountAgeHours,
        action: state.action,
        quarantineRoleId: state.quarantineRoleId,
        quarantineEnabled: state.quarantineEnabled,
        verificationMode: state.verificationMode,
        autoLockdown: state.autoLockdown,
        autoRecover: state.autoRecover,
        alertChannelId: state.alertChannelId,
      },
      { action: state.action },
    );
    setSaving(false);
    if (result.ok) toast.success('Anti-raid configuration saved');
    else toast.error(result.error);
  };

  const toggleLockdown = async () => {
    const next = !state.lockdownActive;
    const result = await upsertGuildConfig(guildId, 'antiRaid', { lockdownActive: next });
    if (result.ok) {
      patch({ lockdownActive: next });
      toast.success(next ? 'Lockdown enabled' : 'Lockdown lifted');
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Status */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>Live anti-raid state</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Protection</span>
            <Badge variant={state.enabled ? 'success' : 'secondary'}>
              {state.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Last detected raid</span>
            <span className="text-sm text-muted-foreground">
              {state.lastRaidAt ? relativeTime(state.lastRaidAt) : 'Never'}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Lock className="h-4 w-4" aria-hidden="true" /> Lockdown
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Blocks all joins and messages from non-staff.
              </p>
            </div>
            <Badge variant={state.lockdownActive ? 'destructive' : 'outline'}>
              {state.lockdownActive ? 'ACTIVE' : 'inactive'}
            </Badge>
          </div>
          <Button
            variant={state.lockdownActive ? 'default' : 'destructive'}
            className="w-full"
            onClick={() => setLockdownConfirm(true)}
          >
            {state.lockdownActive ? 'Lift lockdown' : 'Enable lockdown'}
          </Button>
        </CardContent>
      </Card>

      {/* Detection thresholds */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Detection &amp; response</CardTitle>
          <CardDescription>
            When join velocity exceeds the threshold inside the window, the action fires.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <label htmlFor="ar-enabled" className="text-sm font-medium">Anti-raid enabled</label>
            <Switch id="ar-enabled" checked={state.enabled} onCheckedChange={(enabled) => patch({ enabled })} />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="ar-threshold" className="text-sm font-medium">Join threshold</label>
              <span className="font-mono text-sm text-primary">{state.joinThreshold} joins</span>
            </div>
            <Slider
              id="ar-threshold"
              value={state.joinThreshold}
              min={2}
              max={100}
              onChange={(joinThreshold) => patch({ joinThreshold })}
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="ar-window" className="text-sm font-medium">Window</label>
              <span className="font-mono text-sm text-primary">{state.windowSeconds}s</span>
            </div>
            <Slider
              id="ar-window"
              value={state.windowSeconds}
              min={10}
              max={600}
              step={10}
              onChange={(windowSeconds) => patch({ windowSeconds })}
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="ar-age" className="text-sm font-medium">Min account age</label>
              <span className="font-mono text-sm text-primary">{state.minAccountAgeHours}h</span>
            </div>
            <Slider
              id="ar-age"
              value={state.minAccountAgeHours}
              min={0}
              max={720}
              step={24}
              onChange={(minAccountAgeHours) => patch({ minAccountAgeHours })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="ar-action" className="text-sm font-medium">Action</label>
              <Select
                id="ar-action"
                options={[
                  { value: 'ALERT_MODS', label: 'Alert mods' },
                  { value: 'TIMEOUT', label: 'Timeout joins' },
                  { value: 'KICK', label: 'Kick joins' },
                  { value: 'BAN', label: 'Ban joins' },
                  { value: 'ADD_ROLE', label: 'Quarantine (role)' },
                ]}
                value={state.action}
                onChange={(e) => patch({ action: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ar-quarantine" className="text-sm font-medium">Quarantine role</label>
              <RoleSelect
                id="ar-quarantine"
                roles={roles}
                value={state.quarantineRoleId}
                onChange={(quarantineRoleId) => patch({ quarantineRoleId })}
                placeholder="No quarantine role"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ar-alert" className="text-sm font-medium">Alert channel</label>
              <ChannelSelect
                id="ar-alert"
                channels={channels}
                value={state.alertChannelId}
                onChange={(alertChannelId) => patch({ alertChannelId })}
                onlyText
                placeholder="No alert channel"
              />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Test mode</p>
                <p className="text-xs text-muted-foreground">Log would-be raids without acting.</p>
              </div>
              <Switch
                checked={testMode}
                onCheckedChange={(on) => {
                  setTestMode(on);
                  if (on) patch({ enabled: false });
                  toast.info(
                    on
                      ? 'Test mode on — protection paused. Alerts will be logged but no action taken.'
                      : 'Test mode off — re-enable protection with the switch above.',
                  );
                }}
                aria-label="Test mode"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto-lockdown on raid</p>
                <p className="text-xs text-muted-foreground">Enable lockdown automatically when the threshold trips.</p>
              </div>
              <Switch checked={state.autoLockdown} onCheckedChange={(autoLockdown) => patch({ autoLockdown })} aria-label="Auto lockdown" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto-recover</p>
                <p className="text-xs text-muted-foreground">Lift auto-lockdown when joins normalize.</p>
              </div>
              <Switch checked={state.autoRecover} onCheckedChange={(autoRecover) => patch({ autoRecover })} aria-label="Auto recover" />
            </div>
          </div>

          <Button onClick={save} loading={saving} className="w-full sm:w-auto">
            <Save className="h-4 w-4" /> Save configuration
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={lockdownConfirm}
        onOpenChange={setLockdownConfirm}
        title={state.lockdownActive ? 'Lift lockdown?' : 'Enable lockdown?'}
        description={
          state.lockdownActive
            ? 'Members will be able to send messages and join again.'
            : 'All non-staff members will be prevented from sending messages, and new joins will be rejected until you lift the lockdown.'
        }
        confirmLabel={state.lockdownActive ? 'Lift lockdown' : 'Lock down server'}
        destructive={!state.lockdownActive}
        onConfirm={() => void toggleLockdown()}
      />
    </div>
  );
}
