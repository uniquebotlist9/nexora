'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Gift, Plus, RefreshCw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FormField } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import type { GuildOption } from '@/components/shared/guild-selects';
import { ChannelSelect, RoleSelect } from '@/components/shared/guild-selects';
import { createGiveaway, endGiveaway, rerollGiveaway } from './actions';

export interface GiveawayView {
  id: string;
  prize: string;
  channelId: string;
  winnerCount: number;
  status: 'RUNNING' | 'ENDED' | 'CANCELLED';
  endsAt: string;
  entries: number;
  rerollCount: number;
}

const DURATIONS = [
  { minutes: 60, label: '1 hour' },
  { minutes: 360, label: '6 hours' },
  { minutes: 1440, label: '1 day' },
  { minutes: 4320, label: '3 days' },
  { minutes: 10080, label: '1 week' },
];

export function GiveawaysList({
  guildId,
  giveaways,
  channels,
  roles,
  runningLimit,
  runningCount,
}: {
  guildId: string;
  giveaways: GiveawayView[];
  channels: GuildOption[];
  roles: GuildOption[];
  runningLimit: number;
  runningCount: number;
}) {
  const [creating, setCreating] = React.useState(false);
  const [ending, setEnding] = React.useState<GiveawayView | null>(null);
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{runningCount}</span> running giveaways
          (plan limit: {runningLimit})
        </p>
        <Button
          variant="gradient"
          size="sm"
          disabled={runningCount >= runningLimit}
          onClick={() => setCreating(true)}
          title={runningCount >= runningLimit ? 'Plan limit reached' : undefined}
        >
          <Plus className="h-4 w-4" /> New giveaway
        </Button>
      </div>

      {giveaways.length === 0 ? (
        <EmptyState
          icon={Gift}
          title="No giveaways yet"
          description="Create your first giveaway — the bot posts it, tracks entries and draws winners automatically."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prize</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Winners</TableHead>
                  <TableHead>Entries</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ends</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {giveaways.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.prize}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">#{channelName(g.channelId)}</TableCell>
                    <TableCell>{g.winnerCount}</TableCell>
                    <TableCell>{g.entries}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          g.status === 'RUNNING' ? 'success' : g.status === 'ENDED' ? 'secondary' : 'destructive'
                        }
                      >
                        {g.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(g.endsAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {g.status === 'RUNNING' && (
                          <Button variant="ghost" size="icon" aria-label={`End ${g.prize}`} onClick={() => setEnding(g)}>
                            <Square className="h-4 w-4" />
                          </Button>
                        )}
                        {g.status === 'ENDED' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Reroll ${g.prize}`}
                            onClick={async () => {
                              const result = await rerollGiveaway(guildId, g.id);
                              if (result.ok) toast.success('Reroll queued');
                              else toast.error(result.error);
                            }}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={creating}
        onOpenChange={setCreating}
        title="New giveaway"
        description="The bot posts the giveaway and draws winners when it ends."
      >
        <GiveawayForm
          guildId={guildId}
          channels={channels}
          roles={roles}
          onDone={() => setCreating(false)}
        />
      </Dialog>

      <ConfirmDialog
        open={ending !== null}
        onOpenChange={(open) => !open && setEnding(null)}
        title={`End "${ending?.prize}" early?`}
        description="Winners will be drawn immediately and the giveaway message updated."
        confirmLabel="End now"
        destructive
        onConfirm={async () => {
          if (!ending) return;
          const result = await endGiveaway(guildId, ending.id);
          if (result.ok) toast.success('Giveaway ending — winners being drawn');
          else toast.error(result.error);
        }}
      />
    </div>
  );
}

function GiveawayForm({
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
  const [prize, setPrize] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [channelId, setChannelId] = React.useState<string>();
  const [winnerCount, setWinnerCount] = React.useState(1);
  const [duration, setDuration] = React.useState(1440);
  const [requiredRoleId, setRequiredRoleId] = React.useState<string>();
  const [minMessages, setMinMessages] = React.useState<string>('');
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    setSaving(true);
    const result = await createGiveaway(guildId, {
      channelId: channelId ?? '',
      prize,
      description: description || undefined,
      winnerCount,
      durationMinutes: duration,
      requiredRoleId: requiredRoleId || undefined,
      minMessages: minMessages ? Number(minMessages) : undefined,
    });
    setSaving(false);
    if (result.ok) {
      toast.success('Giveaway created — the bot will post it shortly');
      onDone();
    } else {
      toast.error(result.error, { description: Object.values(result.fieldErrors ?? {})[0] });
    }
  };

  return (
    <div className="space-y-4">
      <FormField label="Prize" htmlFor="g-prize" required>
        <Input id="g-prize" value={prize} onChange={(e) => setPrize(e.target.value)} placeholder="1 month of Discord Nitro" maxLength={256} />
      </FormField>
      <FormField label="Description" htmlFor="g-desc">
        <Input id="g-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional details" maxLength={1000} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Channel" htmlFor="g-channel" required>
          <ChannelSelect id="g-channel" channels={channels} onlyText value={channelId} onChange={setChannelId} placeholder="Select channel" allowEmpty={false} />
        </FormField>
        <FormField label="Winners" htmlFor="g-winners" required>
          <Input id="g-winners" type="number" min={1} max={50} value={winnerCount} onChange={(e) => setWinnerCount(Number(e.target.value) || 1)} />
        </FormField>
        <FormField label="Duration" htmlFor="g-duration" required>
          <Select
            id="g-duration"
            options={DURATIONS.map((d) => ({ value: String(d.minutes), label: d.label }))}
            value={String(duration)}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </FormField>
        <FormField label="Required role" htmlFor="g-role" hint="Only members with this role may enter.">
          <RoleSelect id="g-role" roles={roles} value={requiredRoleId} onChange={setRequiredRoleId} placeholder="Any member" />
        </FormField>
        <FormField label="Min messages" htmlFor="g-messages" hint="Entrants need at least this many messages.">
          <Input id="g-messages" type="number" min={0} value={minMessages} onChange={(e) => setMinMessages(e.target.value)} placeholder="Any" />
        </FormField>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button onClick={submit} loading={saving} disabled={!prize.trim() || !channelId}>
          Create giveaway
        </Button>
      </div>
    </div>
  );
}
