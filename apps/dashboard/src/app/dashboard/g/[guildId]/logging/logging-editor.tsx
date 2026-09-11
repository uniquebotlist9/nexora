'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Save, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import type { GuildOption } from '@/components/shared/guild-selects';
import { ChannelSelect, ChannelMultiSelect } from '@/components/shared/guild-selects';
import { saveLogConfig, type LogConfigCategories, type LogCategorySetting } from './actions';

const CATEGORY_LABELS: { key: string; label: string }[] = [
  { key: 'messageDelete', label: 'Message deletes' },
  { key: 'messageEdit', label: 'Message edits' },
  { key: 'memberJoin', label: 'Member joins' },
  { key: 'memberLeave', label: 'Member leaves' },
  { key: 'ban', label: 'Bans' },
  { key: 'unban', label: 'Unbans' },
  { key: 'kick', label: 'Kicks' },
  { key: 'timeout', label: 'Timeouts' },
  { key: 'roleChanges', label: 'Role changes' },
  { key: 'channelChanges', label: 'Channel changes' },
  { key: 'serverChanges', label: 'Server changes' },
  { key: 'voice', label: 'Voice activity' },
  { key: 'nickname', label: 'Nickname changes' },
  { key: 'invites', label: 'Invites' },
  { key: 'moderation', label: 'Moderation actions' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'giveaways', label: 'Giveaways' },
  { key: 'verification', label: 'Verification' },
  { key: 'automod', label: 'AutoMod triggers' },
];

export function LoggingEditor({
  guildId,
  initialEnabled,
  initialCategories,
  initialIgnored,
  channels,
}: {
  guildId: string;
  initialEnabled: boolean;
  initialCategories: LogConfigCategories;
  initialIgnored: string[];
  channels: GuildOption[];
}) {
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const [categories, setCategories] = React.useState<LogConfigCategories>(initialCategories);
  const [ignored, setIgnored] = React.useState(initialIgnored);
  const [saving, setSaving] = React.useState(false);

  const enabledCount = Object.values(categories).filter((c) => c?.enabled).length;

  const setCategory = (key: string, patch: Partial<LogCategorySetting>) =>
    setCategories((c) => ({ ...c, [key]: { enabled: false, ...c[key], ...patch } }));

  const save = async () => {
    setSaving(true);
    const result = await saveLogConfig(guildId, enabled, categories, ignored);
    setSaving(false);
    if (result.ok) toast.success('Logging configuration saved');
    else toast.error(result.error);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold">Logging</p>
            <p className="text-sm text-muted-foreground">
              Route {CATEGORY_LABELS.length} event categories to the channels you choose.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Enable logging" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Categories{' '}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              ({enabledCount}/{CATEGORY_LABELS.length} enabled)
            </span>
          </CardTitle>
          <CardDescription>Each category can go to its own channel.</CardDescription>
        </CardHeader>
        <CardContent>
          {channels.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="No channels synced yet"
              description="Channels appear here once the bot has synced your server."
            />
          ) : (
            <div className="grid gap-2 lg:grid-cols-2">
              {CATEGORY_LABELS.map((cat) => {
                const setting = categories[cat.key];
                return (
                  <div
                    key={cat.key}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3"
                  >
                    <Switch
                      checked={setting?.enabled ?? false}
                      onCheckedChange={(on) => setCategory(cat.key, { enabled: on })}
                      aria-label={`Enable ${cat.label} logging`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{cat.label}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{cat.key}</p>
                    </div>
                    <div className="w-44">
                      <ChannelSelect
                        channels={channels}
                        onlyText
                        value={setting?.channelId}
                        onChange={(channelId) => setCategory(cat.key, { channelId })}
                        placeholder="Default channel"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ignored channels</CardTitle>
          <CardDescription>Events in these channels are never logged.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChannelMultiSelect
            channels={channels}
            value={ignored}
            onChange={setIgnored}
            placeholder="No ignored channels"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} loading={saving}>
          <Save className="h-4 w-4" /> Save configuration
        </Button>
      </div>
    </div>
  );
}
