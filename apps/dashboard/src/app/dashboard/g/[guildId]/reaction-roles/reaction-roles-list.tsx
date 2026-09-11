'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { MousePointerClick, Plus, Rocket, Trash2 } from 'lucide-react';
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
import type { GuildOption } from '@/components/shared/guild-selects';
import { ChannelSelect, RoleSelect } from '@/components/shared/guild-selects';
import {
  createReactionRolePanel, deployReactionRolePanel, deleteReactionRolePanel,
  type PanelInput,
} from './actions';

export interface PanelView {
  id: string;
  channelId: string;
  title: string;
  style: string;
  options: { roleId: string; label: string; description?: string; emoji?: string }[];
  singleChoice: boolean;
  deployed: boolean;
}

export function ReactionRolesList({
  guildId,
  panels,
  channels,
  roles,
  panelLimit,
}: {
  guildId: string;
  panels: PanelView[];
  channels: GuildOption[];
  roles: GuildOption[];
  panelLimit: number;
}) {
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<PanelView | null>(null);
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{panels.length}</span> of {panelLimit} panels
          (current plan)
        </p>
        <Button
          variant="gradient"
          size="sm"
          disabled={panels.length >= panelLimit}
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" /> New panel
        </Button>
      </div>

      {panels.length === 0 ? (
        <EmptyState
          icon={MousePointerClick}
          title="No role panels yet"
          description="Build a button or dropdown menu that members use to self-assign roles."
        />
      ) : (
        <div className="grid gap-3">
          {panels.map((panel) => (
            <Card key={panel.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{panel.title}</p>
                    <Badge variant="outline">{panel.style}</Badge>
                    {panel.singleChoice && <Badge variant="secondary">single choice</Badge>}
                    <Badge variant={panel.deployed ? 'success' : 'warning'}>
                      {panel.deployed ? 'deployed' : 'pending deploy'}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    #{channelName(panel.channelId)} · {panel.options.length} role option
                    {panel.options.length === 1 ? '' : 's'}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    const result = await deployReactionRolePanel(guildId, panel.id);
                    if (result.ok) toast.success('Deployment queued — the bot will post it shortly.');
                    else toast.error(result.error);
                  }}
                >
                  <Rocket className="h-3.5 w-3.5" /> {panel.deployed ? 'Redeploy' : 'Deploy'}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${panel.title}`}
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleting(panel)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={creating}
        onOpenChange={setCreating}
        title="New role panel"
        description="Members click buttons (or pick from a dropdown) to get roles."
        className="max-w-2xl"
      >
        <PanelForm guildId={guildId} channels={channels} roles={roles} onDone={() => setCreating(false)} />
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.title}"?`}
        description="The panel message stays on Discord but its buttons stop working."
        confirmLabel="Delete panel"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          const result = await deleteReactionRolePanel(guildId, deleting.id);
          if (result.ok) toast.success('Panel deleted');
          else toast.error(result.error);
        }}
      />
    </div>
  );
}

function PanelForm({
  guildId,
  channels,
  roles,
  onDone,
}: {
  guildId: string;
  channels: GuildOption[];
  roles: GuildOption[];
  onDone: () => void;
}) {
  const [channelId, setChannelId] = React.useState<string>();
  const [title, setTitle] = React.useState('Select your roles');
  const [style, setStyle] = React.useState<PanelInput['style']>('BUTTON');
  const [singleChoice, setSingleChoice] = React.useState(false);
  const [options, setOptions] = React.useState<PanelInput['options']>([]);
  const [saving, setSaving] = React.useState(false);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Channel" htmlFor="rr-channel" required>
          <ChannelSelect id="rr-channel" channels={channels} onlyText value={channelId} onChange={setChannelId} placeholder="Select channel" allowEmpty={false} />
        </FormField>
        <FormField label="Style" htmlFor="rr-style">
          <Select
            id="rr-style"
            options={[
              { value: 'BUTTON', label: 'Buttons' },
              { value: 'DROPDOWN', label: 'Dropdown' },
              { value: 'REACTION', label: 'Reactions' },
            ]}
            value={style}
            onChange={(e) => setStyle(e.target.value as PanelInput['style'])}
          />
        </FormField>
      </div>
      <FormField label="Panel title" htmlFor="rr-title" required>
        <Input id="rr-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={256} />
      </FormField>

      <div className="space-y-2 rounded-xl border border-border p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Role options ({options.length})</h4>
          <Button
            variant="outline"
            size="sm"
            disabled={options.length >= 25}
            onClick={() => setOptions((o) => [...o, { roleId: '', label: '', emoji: '' }])}
          >
            <Plus className="h-3.5 w-3.5" /> Add option
          </Button>
        </div>
        {options.map((opt, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input
              value={opt.emoji ?? ''}
              onChange={(e) => setOptions((o) => o.map((x, j) => (j === i ? { ...x, emoji: e.target.value } : x)))}
              placeholder="🎮"
              aria-label={`Option ${i + 1} emoji`}
              className="w-16"
              maxLength={64}
            />
            <div className="min-w-[140px] flex-1">
              <RoleSelect
                roles={roles}
                value={opt.roleId}
                onChange={(roleId) => setOptions((o) => o.map((x, j) => (j === i ? { ...x, roleId: roleId ?? '' } : x)))}
                placeholder="Select role"
                allowEmpty={false}
              />
            </div>
            <Input
              value={opt.label}
              onChange={(e) => setOptions((o) => o.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              placeholder="Label"
              aria-label={`Option ${i + 1} label`}
              className="w-36"
              maxLength={100}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove option ${i + 1}`}
              className="text-destructive hover:bg-destructive/10"
              onClick={() => setOptions((o) => o.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Single choice</p>
          <p className="text-xs text-muted-foreground">Selecting one option removes the others.</p>
        </div>
        <Switch checked={singleChoice} onCheckedChange={setSingleChoice} aria-label="Single choice" />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button
          loading={saving}
          disabled={!channelId || options.length === 0}
          onClick={async () => {
            setSaving(true);
            const result = await createReactionRolePanel(guildId, {
              channelId: channelId ?? '',
              title,
              style,
              options: options.filter((o) => o.roleId && o.label),
              singleChoice,
            });
            setSaving(false);
            if (result.ok) {
              toast.success('Panel created — deploy it to post the message');
              onDone();
            } else {
              toast.error(result.error);
            }
          }}
        >
          Create panel
        </Button>
      </div>
    </div>
  );
}
