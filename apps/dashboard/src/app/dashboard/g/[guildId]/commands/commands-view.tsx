'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Pencil, Plus, SquareTerminal, Trash2 } from 'lucide-react';
import type { MessagePayload } from '@nexora/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FormField } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { MessageBuilder } from '@/components/shared/message-builder';
import type { GuildOption } from '@/components/shared/guild-selects';
import { RoleMultiSelect } from '@/components/shared/guild-selects';
import {
  createCustomCommand, updateCustomCommand, deleteCustomCommand, toggleCustomCommand,
  type CustomCommandInput,
} from './actions';
import { CORE_COMMANDS } from './core-commands';

export interface CustomCommandView {
  id: string;
  name: string;
  description: string;
  response: MessagePayload;
  cooldownSeconds: number;
  requiredRoleIds: string[];
  enabled: boolean;
  usageCount: number;
}

const PERMISSION_OPTIONS = [
  { value: '', label: 'Anyone' },
  { value: 'MANAGE_GUILD', label: 'Manage Server' },
  { value: 'ADMINISTRATOR', label: 'Administrator' },
  { value: 'MODERATE_MEMBERS', label: 'Moderate Members' },
  { value: 'MANAGE_MESSAGES', label: 'Manage Messages' },
];

export function CommandsView({
  guildId,
  commands,
  roles,
  limit,
}: {
  guildId: string;
  commands: CustomCommandView[];
  roles: GuildOption[];
  limit: number;
}) {
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<CustomCommandView | null>(null);
  const [deleting, setDeleting] = React.useState<CustomCommandView | null>(null);

  const categories = Array.from(new Set(CORE_COMMANDS.map((c) => c.category)));

  return (
    <Tabs defaultValue="custom" className="space-y-4">
      <TabsList>
        <TabsTrigger value="custom">
          Custom ({commands.length}/{limit})
        </TabsTrigger>
        <TabsTrigger value="core">Core commands</TabsTrigger>
      </TabsList>

      <TabsContent value="custom">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Custom slash commands with your own response, cooldown and role gates.
          </p>
          <Button
            variant="gradient"
            size="sm"
            disabled={commands.length >= limit}
            onClick={() => setCreating(true)}
            title={commands.length >= limit ? 'Plan limit reached' : undefined}
          >
            <Plus className="h-4 w-4" /> New command
          </Button>
        </div>

        {commands.length === 0 ? (
          <EmptyState
            icon={SquareTerminal}
            title="No custom commands yet"
            description="Build your own slash command with a message or embed response — no code required."
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Command</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Cooldown</TableHead>
                    <TableHead>Uses</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commands.map((cmd) => (
                    <TableRow key={cmd.id}>
                      <TableCell className="font-mono text-sm">/{cmd.name}</TableCell>
                      <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">{cmd.description}</TableCell>
                      <TableCell className="text-sm">{cmd.cooldownSeconds}s</TableCell>
                      <TableCell className="text-sm">{cmd.usageCount}</TableCell>
                      <TableCell>
                        <Switch
                          checked={cmd.enabled}
                          onCheckedChange={async (enabled) => {
                            const result = await toggleCustomCommand(guildId, cmd.id, enabled);
                            if (!result.ok) toast.error(result.error);
                          }}
                          aria-label={`Toggle /${cmd.name}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" aria-label={`Edit /${cmd.name}`} onClick={() => setEditing(cmd)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete /${cmd.name}`}
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleting(cmd)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="core">
        <Card>
          <CardContent className="p-5">
            <p className="mb-4 text-sm text-muted-foreground">
              The built-in command registry — always available; some need Discord permissions.
            </p>
            {categories.map((category) => (
              <div key={category} className="mb-5">
                <h4 className="mb-2 text-sm font-semibold">{category}</h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {CORE_COMMANDS.filter((c) => c.category === category).map((cmd) => (
                    <div key={cmd.name} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <code className="text-sm font-semibold">{cmd.name}</code>
                        <Badge variant="outline" className="text-[10px]">{cmd.permission}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{cmd.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </TabsContent>

      <Dialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        title={editing ? `Edit /${editing.name}` : 'New custom command'}
        description="The command registers as a slash command on the server."
        className="max-w-3xl"
      >
        <CommandForm
          key={editing?.id ?? 'new'}
          guildId={guildId}
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
        title={`Delete /${deleting?.name}?`}
        description="The command stops working immediately."
        confirmLabel="Delete command"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          const result = await deleteCustomCommand(guildId, deleting.id);
          if (result.ok) toast.success('Command deleted');
          else toast.error(result.error);
        }}
      />
    </Tabs>
  );
}

function CommandForm({
  guildId,
  roles,
  initial,
  onDone,
}: {
  guildId: string;
  roles: GuildOption[];
  initial?: CustomCommandView;
  onDone: () => void;
}) {
  const [name, setName] = React.useState(initial?.name ?? '');
  const [description, setDescription] = React.useState(initial?.description ?? '');
  const [response, setResponse] = React.useState<MessagePayload>(initial?.response ?? {});
  const [cooldown, setCooldown] = React.useState(initial?.cooldownSeconds ?? 3);
  const [requiredRoleIds, setRequiredRoleIds] = React.useState<string[]>(initial?.requiredRoleIds ?? []);
  const [requiredPermission, setRequiredPermission] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    setSaving(true);
    const input: CustomCommandInput = {
      name,
      description,
      response,
      cooldownSeconds: cooldown,
      requiredRoleIds,
      requiredPermission: requiredPermission || undefined,
      enabled: true,
    };
    const result = initial
      ? await updateCustomCommand(guildId, initial.id, input)
      : await createCustomCommand(guildId, input);
    setSaving(false);
    if (result.ok) {
      toast.success(initial ? 'Command updated' : 'Command created');
      onDone();
    } else {
      toast.error(result.error, { description: Object.values(result.fieldErrors ?? {})[0] });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Name" htmlFor="cc-name" required hint="Lowercase letters, numbers and dashes.">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">/</span>
            <Input id="cc-name" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="rules" maxLength={32} />
          </div>
        </FormField>
        <FormField label="Cooldown (seconds)" htmlFor="cc-cooldown">
          <Input id="cc-cooldown" type="number" min={0} max={3600} value={cooldown} onChange={(e) => setCooldown(Number(e.target.value) || 0)} />
        </FormField>
        <FormField label="Description" htmlFor="cc-desc" required className="sm:col-span-2">
          <Input id="cc-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Show the server rules" maxLength={100} />
        </FormField>
        <FormField label="Required roles" hint="Empty = anyone can use it.">
          <RoleMultiSelect roles={roles} value={requiredRoleIds} onChange={setRequiredRoleIds} placeholder="Any role" />
        </FormField>
        <FormField label="Required permission" htmlFor="cc-perm">
          <Select
            id="cc-perm"
            options={PERMISSION_OPTIONS}
            value={requiredPermission}
            onChange={(e) => setRequiredPermission(e.target.value)}
          />
        </FormField>
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold">Response</h4>
        <MessageBuilder value={response} onChange={setResponse} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button onClick={submit} loading={saving} disabled={!name.trim() || !description.trim()}>
          {initial ? 'Save changes' : 'Create command'}
        </Button>
      </div>
    </div>
  );
}
