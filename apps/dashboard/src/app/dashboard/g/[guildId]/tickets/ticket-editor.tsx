'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Rocket, Save, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form';
import type { GuildOption } from '@/components/shared/guild-selects';
import { ChannelSelect, RoleMultiSelect } from '@/components/shared/guild-selects';
import {
  saveTicketConfig, deployTicketPanel, addToBlacklist, removeFromBlacklist,
  type TicketTypeInput, type TicketConfigInput,
} from './actions';

const PRIORITIES: TicketTypeInput['priority'][] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export function TicketConfigEditor({
  guildId,
  initial,
  roles,
  channels,
  initialBlacklist,
  panelDeployed,
  typeLimit,
}: {
  guildId: string;
  initial: Omit<TicketConfigInput, 'blacklist'>;
  roles: GuildOption[];
  channels: GuildOption[];
  initialBlacklist: string[];
  panelDeployed: boolean;
  typeLimit: number;
}) {
  const [config, setConfig] = React.useState(initial);
  const [blacklist, setBlacklist] = React.useState(initialBlacklist);
  const [newBlacklistId, setNewBlacklistId] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [deploying, setDeploying] = React.useState(false);

  const patch = (p: Partial<typeof config>) => setConfig((c) => ({ ...c, ...p }));
  const patchType = (index: number, p: Partial<TicketTypeInput>) =>
    setConfig((c) => ({ ...c, types: c.types.map((t, i) => (i === index ? { ...t, ...p } : t)) }));

  const save = async () => {
    setSaving(true);
    const result = await saveTicketConfig(guildId, { ...config, blacklist });
    setSaving(false);
    if (result.ok) toast.success('Ticket settings saved');
    else toast.error(result.error, { description: Object.values(result.fieldErrors ?? {})[0] });
  };

  const deploy = async () => {
    setDeploying(true);
    const result = await deployTicketPanel(guildId);
    setDeploying(false);
    if (result.ok) toast.success('Panel deployment queued — the bot will post it shortly.');
    else toast.error(result.error);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold">Ticket system</p>
            <p className="text-sm text-muted-foreground">
              Private support channels per ticket, with claiming and transcripts.
            </p>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(enabled) => patch({ enabled })}
            aria-label="Enable ticket system"
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              Ticket types{' '}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                ({config.types.length}/{typeLimit})
              </span>
            </CardTitle>
            <CardDescription>Each type becomes a button on the panel.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {config.types.map((type, i) => (
              <div key={i} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[64px_1fr_120px_130px_auto]">
                <FormField label="Emoji" htmlFor={`tt-emoji-${i}`}>
                  <Input
                    id={`tt-emoji-${i}`}
                    value={type.emoji ?? ''}
                    onChange={(e) => patchType(i, { emoji: e.target.value })}
                    placeholder="🎫"
                    maxLength={64}
                  />
                </FormField>
                <div className="space-y-3">
                  <FormField label="Name" htmlFor={`tt-name-${i}`} required>
                    <Input
                      id={`tt-name-${i}`}
                      value={type.name}
                      onChange={(e) => patchType(i, { name: e.target.value })}
                      placeholder="Support"
                      maxLength={100}
                    />
                  </FormField>
                  <FormField label="Description" htmlFor={`tt-desc-${i}`}>
                    <Input
                      id={`tt-desc-${i}`}
                      value={type.description}
                      onChange={(e) => patchType(i, { description: e.target.value })}
                      placeholder="General help and questions"
                      maxLength={200}
                    />
                  </FormField>
                </div>
                <FormField label="Priority" htmlFor={`tt-prio-${i}`}>
                  <Select
                    id={`tt-prio-${i}`}
                    options={PRIORITIES.map((p) => ({ value: p, label: p }))}
                    value={type.priority}
                    onChange={(e) => patchType(i, { priority: e.target.value as TicketTypeInput['priority'] })}
                  />
                </FormField>
                <FormField label="Category" htmlFor={`tt-cat-${i}`}>
                  <ChannelSelect
                    id={`tt-cat-${i}`}
                    channels={channels}
                    value={type.categoryId}
                    onChange={(categoryId) => patchType(i, { categoryId })}
                    placeholder="—"
                    allowEmpty={false}
                  />
                </FormField>
                <div className="flex items-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove type ${type.name}`}
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => patch({ types: config.types.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              disabled={config.types.length >= typeLimit}
              onClick={() =>
                patch({
                  types: [
                    ...config.types,
                    { id: `type-${Date.now()}`, name: '', description: '', emoji: '🎫', priority: 'LOW' },
                  ],
                })
              }
            >
              <Plus className="h-3.5 w-3.5" /> Add type
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
            <CardDescription>Panel, staff, transcripts and inactivity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField label="Panel channel" htmlFor="t-panel">
              <ChannelSelect
                id="t-panel"
                channels={channels}
                onlyText
                value={config.channelId}
                onChange={(channelId) => patch({ channelId })}
                placeholder="No panel channel"
              />
            </FormField>
            <FormField label="Transcript channel" htmlFor="t-transcript">
              <ChannelSelect
                id="t-transcript"
                channels={channels}
                onlyText
                value={config.transcriptChannelId}
                onChange={(transcriptChannelId) => patch({ transcriptChannelId })}
                placeholder="No transcript channel"
              />
            </FormField>
            <FormField label="Staff roles" htmlFor="t-staff">
              <RoleMultiSelect
                roles={roles}
                value={config.staffRoleIds}
                onChange={(staffRoleIds) => patch({ staffRoleIds })}
                placeholder="No staff roles"
              />
            </FormField>
            <FormField label="Inactivity close (hours)" htmlFor="t-inactivity">
              <Input
                id="t-inactivity"
                type="number"
                min={1}
                max={720}
                value={config.inactivityHours}
                onChange={(e) => patch({ inactivityHours: Number(e.target.value) || 48 })}
              />
            </FormField>
            <div className="flex items-center justify-between">
              <label htmlFor="t-claim" className="text-sm font-medium">Require claiming</label>
              <Switch
                id="t-claim"
                checked={config.claimRequired}
                onCheckedChange={(claimRequired) => patch({ claimRequired })}
              />
            </div>
            <Button className="w-full" onClick={deploy} loading={deploying}>
              <Rocket className="h-4 w-4" />
              {panelDeployed ? 'Redeploy panel' : 'Deploy panel'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Deploying queues a task for the bot — it posts the panel message in the selected
              channel within seconds.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Blacklist</CardTitle>
          <CardDescription>Users who cannot open tickets.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {blacklist.length === 0 ? (
            <p className="text-sm text-muted-foreground">No blacklisted users.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {blacklist.map((userId) => (
                <li key={userId}>
                  <Badge variant="secondary">
                    <span className="font-mono text-xs">{userId}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${userId} from blacklist`}
                      onClick={async () => {
                        const result = await removeFromBlacklist(guildId, userId);
                        if (result.ok) setBlacklist((b) => b.filter((id) => id !== userId));
                        else toast.error(result.error);
                      }}
                      className="ml-1 text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input
              value={newBlacklistId}
              onChange={(e) => setNewBlacklistId(e.target.value)}
              placeholder="User ID (e.g. 123456789012345678)"
              aria-label="User ID to blacklist"
              className="max-w-xs font-mono"
            />
            <Button
              variant="secondary"
              onClick={async () => {
                const result = await addToBlacklist(guildId, newBlacklistId.trim());
                if (result.ok) {
                  setBlacklist((b) => [...b, newBlacklistId.trim()]);
                  setNewBlacklistId('');
                  toast.success('User blacklisted');
                } else {
                  toast.error(result.error);
                }
              }}
            >
              <UserPlus className="h-4 w-4" /> Blacklist
            </Button>
          </div>
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
