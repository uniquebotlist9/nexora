'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowRight, Pencil, Plus, Trash2, Workflow, Zap } from 'lucide-react';
import type { MessagePayload } from '@nexora/types';
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
import { MessageBuilder } from '@/components/shared/message-builder';
import type { GuildOption } from '@/components/shared/guild-selects';
import { ChannelSelect, RoleSelect } from '@/components/shared/guild-selects';
import {
  createAutomation, updateAutomation, deleteAutomation, toggleAutomation,
  type AutomationInput, type AutomationTriggerInput, type AutomationActionInput,
} from './actions';

export interface AutomationView {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: string;
  triggerCount: number;
  actions: AutomationActionInput[];
}

const TRIGGERS = [
  { value: 'MEMBER_JOIN', label: 'Member joins' },
  { value: 'MEMBER_LEAVE', label: 'Member leaves' },
  { value: 'ROLE_ADDED', label: 'Role added' },
  { value: 'ROLE_REMOVED', label: 'Role removed' },
  { value: 'MESSAGE_SENT', label: 'Message sent' },
  { value: 'KEYWORD_DETECTED', label: 'Keyword detected' },
  { value: 'LEVEL_REACHED', label: 'Level reached' },
  { value: 'TICKET_CREATED', label: 'Ticket created' },
  { value: 'TICKET_CLOSED', label: 'Ticket closed' },
  { value: 'GIVEAWAY_ENDED', label: 'Giveaway ended' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'MILESTONE', label: 'Member milestone' },
];

const ACTIONS = [
  { value: 'SEND_MESSAGE', label: 'Send message' },
  { value: 'SEND_DM', label: 'Send DM' },
  { value: 'ADD_ROLE', label: 'Add role' },
  { value: 'REMOVE_ROLE', label: 'Remove role' },
  { value: 'TIMEOUT', label: 'Timeout member' },
  { value: 'CREATE_CHANNEL', label: 'Create channel' },
  { value: 'DELETE_CHANNEL', label: 'Delete channel' },
  { value: 'LOG_EVENT', label: 'Log event' },
  { value: 'CREATE_TICKET', label: 'Create ticket' },
  { value: 'CHANGE_NICKNAME', label: 'Change nickname' },
  { value: 'SEND_WEBHOOK', label: 'Send webhook' },
];

export function AutomationsList({
  guildId,
  automations,
  channels,
  roles,
  limit,
}: {
  guildId: string;
  automations: AutomationView[];
  channels: GuildOption[];
  roles: GuildOption[];
  limit: number;
}) {
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<AutomationView | null>(null);
  const [deleting, setDeleting] = React.useState<AutomationView | null>(null);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{automations.length}</span> of {limit}{' '}
          automations (current plan)
        </p>
        <Button
          variant="gradient"
          size="sm"
          disabled={automations.length >= limit}
          onClick={() => setCreating(true)}
          title={automations.length >= limit ? 'Plan limit reached' : undefined}
        >
          <Plus className="h-4 w-4" /> New automation
        </Button>
      </div>

      {automations.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="No automations yet"
          description="Wire triggers to actions — welcome new members, act on keywords, run scheduled jobs and more."
        />
      ) : (
        <div className="grid gap-3">
          {automations.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{a.name}</p>
                    <Badge variant="outline">
                      <Zap className="mr-1 h-3 w-3" aria-hidden="true" />
                      {TRIGGERS.find((t) => t.value === a.triggerType)?.label ?? a.triggerType}
                    </Badge>
                    {a.triggerCount > 0 && (
                      <Badge variant="secondary">fired {a.triggerCount}×</Badge>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {a.actions.map((act, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <span aria-hidden="true">→</span>}
                        <span>{ACTIONS.find((t) => t.value === act.type)?.label ?? act.type}</span>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
                <Switch
                  checked={a.enabled}
                  onCheckedChange={async (enabled) => {
                    const result = await toggleAutomation(guildId, a.id, enabled);
                    if (!result.ok) toast.error(result.error);
                  }}
                  aria-label={`Toggle ${a.name}`}
                />
                <Button variant="ghost" size="icon" aria-label={`Edit ${a.name}`} onClick={() => setEditing(a)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${a.name}`}
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleting(a)}
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
        title={editing ? `Edit "${editing.name}"` : 'New automation'}
        description="Pick a trigger, then chain up to 10 actions."
        className="max-w-3xl"
      >
        <AutomationForm
          key={editing?.id ?? 'new'}
          guildId={guildId}
          channels={channels}
          roles={roles}
          initial={editing ?? undefined}
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
        description="The automation stops running immediately."
        confirmLabel="Delete automation"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          const result = await deleteAutomation(guildId, deleting.id);
          if (result.ok) toast.success('Automation deleted');
          else toast.error(result.error);
        }}
      />
    </div>
  );
}

function AutomationForm({
  guildId,
  channels,
  roles,
  initial,
  onDone,
}: {
  guildId: string;
  channels: GuildOption[];
  roles: GuildOption[];
  initial?: AutomationView;
  onDone: () => void;
}) {
  const [name, setName] = React.useState(initial?.name ?? '');
  const [triggerType, setTriggerType] = React.useState(initial?.triggerType ?? 'MEMBER_JOIN');
  const [keywords, setKeywords] = React.useState('');
  const [triggerRole, setTriggerRole] = React.useState<string>();
  const [triggerLevel, setTriggerLevel] = React.useState('5');
  const [interval, setInterval] = React.useState('60');
  const [milestone, setMilestone] = React.useState('1000');
  const [actions, setActions] = React.useState<AutomationActionInput[]>(
    initial?.actions ?? [{ type: 'SEND_MESSAGE', config: {} }],
  );
  const [saving, setSaving] = React.useState(false);

  const moveAction = (index: number, dir: -1 | 1) => {
    setActions((a) => {
      const next = [...a];
      const target = index + dir;
      if (target < 0 || target >= next.length) return a;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const submit = async () => {
    const triggerConfig: AutomationTriggerInput['config'] = {};
    if (triggerType === 'KEYWORD_DETECTED' && keywords.trim()) {
      triggerConfig.keywords = keywords.split(',').map((k) => k.trim()).filter(Boolean);
    }
    if (triggerType === 'ROLE_ADDED' || triggerType === 'ROLE_REMOVED') {
      triggerConfig.roleId = triggerRole;
    }
    if (triggerType === 'LEVEL_REACHED') triggerConfig.level = Number(triggerLevel) || 1;
    if (triggerType === 'SCHEDULED') triggerConfig.intervalMinutes = Number(interval) || 60;
    if (triggerType === 'MILESTONE') triggerConfig.memberCount = Number(milestone) || 1000;

    const input: AutomationInput = {
      name,
      enabled: true,
      trigger: { type: triggerType, config: triggerConfig },
      actions: actions.map((a) => ({
        type: a.type,
        config: {
          channelId: a.config.channelId,
          message: a.config.message,
          roleId: a.config.roleId,
          durationMinutes: a.config.durationMinutes,
          channelName: a.config.channelName,
          nickname: a.config.nickname,
          ticketType: a.config.ticketType,
        },
      })),
    };

    setSaving(true);
    const result = initial
      ? await updateAutomation(guildId, initial.id, input)
      : await createAutomation(guildId, input);
    setSaving(false);
    if (result.ok) {
      toast.success(initial ? 'Automation updated' : 'Automation created');
      onDone();
    } else {
      toast.error(result.error, { description: Object.values(result.fieldErrors ?? {})[0] });
    }
  };

  return (
    <div className="space-y-5">
      <FormField label="Name" htmlFor="au-name" required>
        <Input id="au-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Welcome new members" maxLength={100} />
      </FormField>

      {/* Trigger card */}
      <div className="rounded-2xl border-2 border-primary/40 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">Trigger</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="When…" htmlFor="au-trigger" required>
            <Select
              id="au-trigger"
              options={TRIGGERS}
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value)}
            />
          </FormField>
          {triggerType === 'KEYWORD_DETECTED' && (
            <FormField label="Keywords" htmlFor="au-keywords" hint="Comma-separated.">
              <Input id="au-keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="help, support" />
            </FormField>
          )}
          {(triggerType === 'ROLE_ADDED' || triggerType === 'ROLE_REMOVED') && (
            <FormField label="Role" htmlFor="au-trole">
              <RoleSelect id="au-trole" roles={roles} value={triggerRole} onChange={setTriggerRole} placeholder="Select role" allowEmpty={false} />
            </FormField>
          )}
          {triggerType === 'LEVEL_REACHED' && (
            <FormField label="Level" htmlFor="au-level">
              <Input id="au-level" type="number" min={1} max={1000} value={triggerLevel} onChange={(e) => setTriggerLevel(e.target.value)} />
            </FormField>
          )}
          {triggerType === 'SCHEDULED' && (
            <FormField label="Every (minutes)" htmlFor="au-interval">
              <Input id="au-interval" type="number" min={1} value={interval} onChange={(e) => setInterval(e.target.value)} />
            </FormField>
          )}
          {triggerType === 'MILESTONE' && (
            <FormField label="Member count" htmlFor="au-milestone">
              <Input id="au-milestone" type="number" min={1} value={milestone} onChange={(e) => setMilestone(e.target.value)} />
            </FormField>
          )}
        </div>
      </div>

      <div className="flex justify-center" aria-hidden="true">
        <ArrowDown className="h-5 w-5 text-primary" />
      </div>

      {/* Action cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Actions ({actions.length}/10)
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={actions.length >= 10}
            onClick={() => setActions((a) => [...a, { type: 'SEND_MESSAGE', config: {} }])}
          >
            <Plus className="h-3.5 w-3.5" /> Add action
          </Button>
        </div>
        {actions.map((action, i) => (
          <div key={i} className="rounded-2xl border border-border p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                {i + 1}
              </span>
              <Select
                options={ACTIONS}
                value={action.type}
                onChange={(e) =>
                  setActions((a) => a.map((x, j) => (j === i ? { type: e.target.value, config: {} } : x)))
                }
                aria-label={`Action ${i + 1} type`}
                className="w-48"
              />
              <div className="ml-auto flex gap-0.5">
                <Button variant="ghost" size="icon" aria-label={`Move action ${i + 1} up`} disabled={i === 0} onClick={() => moveAction(i, -1)}>
                  ↑
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Move action ${i + 1} down`} disabled={i === actions.length - 1} onClick={() => moveAction(i, 1)}>
                  ↓
                </Button>
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
            </div>

            <ActionConfig
              action={action}
              onChange={(config) =>
                setActions((a) => a.map((x, j) => (j === i ? { ...x, config } : x)))
              }
              channels={channels}
              roles={roles}
              index={i}
            />
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button onClick={submit} loading={saving} disabled={!name.trim() || actions.length === 0}>
          {initial ? 'Save automation' : 'Create automation'}
        </Button>
      </div>
    </div>
  );
}

function ActionConfig({
  action,
  onChange,
  channels,
  roles,
  index,
}: {
  action: AutomationActionInput;
  onChange: (config: AutomationActionInput['config']) => void;
  channels: GuildOption[];
  roles: GuildOption[];
  index: number;
}) {
  const patch = (p: Partial<AutomationActionInput['config']>) =>
    onChange({ ...action.config, ...p });

  // Message-bearing actions get the full builder.
  if (action.type === 'SEND_MESSAGE' || action.type === 'SEND_DM') {
    return (
      <div className="space-y-3">
        {action.type === 'SEND_MESSAGE' && (
          <FormField label="Channel" htmlFor={`ac-channel-${index}`}>
            <ChannelSelect
              id={`ac-channel-${index}`}
              channels={channels}
              onlyText
              value={action.config.channelId}
              onChange={(channelId) => patch({ channelId })}
              placeholder="Select channel"
              allowEmpty={false}
            />
          </FormField>
        )}
        <MessageBuilder
          value={action.config.message ?? {}}
          onChange={(message) => patch({ message: message.content || message.embed ? message : undefined })}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(action.type === 'ADD_ROLE' || action.type === 'REMOVE_ROLE') && (
        <FormField label="Role" htmlFor={`ac-role-${index}`}>
          <RoleSelect
            id={`ac-role-${index}`}
            roles={roles}
            value={action.config.roleId}
            onChange={(roleId) => patch({ roleId })}
            placeholder="Select role"
            allowEmpty={false}
          />
        </FormField>
      )}
      {action.type === 'TIMEOUT' && (
        <FormField label="Duration (minutes)" htmlFor={`ac-duration-${index}`}>
          <Input
            id={`ac-duration-${index}`}
            type="number"
            min={1}
            value={action.config.durationMinutes ?? ''}
            onChange={(e) => patch({ durationMinutes: Number(e.target.value) || undefined })}
          />
        </FormField>
      )}
      {action.type === 'CREATE_CHANNEL' && (
        <FormField label="Channel name" htmlFor={`ac-channelname-${index}`}>
          <Input
            id={`ac-channelname-${index}`}
            value={action.config.channelName ?? ''}
            onChange={(e) => patch({ channelName: e.target.value })}
            placeholder="event-voice"
            maxLength={100}
          />
        </FormField>
      )}
      {action.type === 'CHANGE_NICKNAME' && (
        <FormField label="Nickname" htmlFor={`ac-nickname-${index}`}>
          <Input
            id={`ac-nickname-${index}`}
            value={action.config.nickname ?? ''}
            onChange={(e) => patch({ nickname: e.target.value })}
            placeholder="Newcomer"
            maxLength={32}
          />
        </FormField>
      )}
      {action.type === 'CREATE_TICKET' && (
        <FormField label="Ticket type" htmlFor={`ac-tickettype-${index}`}>
          <Input
            id={`ac-tickettype-${index}`}
            value={action.config.ticketType ?? ''}
            onChange={(e) => patch({ ticketType: e.target.value })}
            placeholder="support"
            maxLength={50}
          />
        </FormField>
      )}
      {action.type === 'LOG_EVENT' && (
        <FormField label="Log channel" htmlFor={`ac-log-${index}`}>
          <ChannelSelect
            id={`ac-log-${index}`}
            channels={channels}
            onlyText
            value={action.config.channelId}
            onChange={(channelId) => patch({ channelId })}
            placeholder="Select channel"
            allowEmpty={false}
          />
        </FormField>
      )}
      {action.type === 'DELETE_CHANNEL' && (
        <FormField label="Channel" htmlFor={`ac-del-${index}`}>
          <ChannelSelect
            id={`ac-del-${index}`}
            channels={channels}
            value={action.config.channelId}
            onChange={(channelId) => patch({ channelId })}
            placeholder="Select channel"
            allowEmpty={false}
          />
        </FormField>
      )}
    </div>
  );
}
