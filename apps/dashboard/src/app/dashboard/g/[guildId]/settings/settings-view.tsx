'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Save, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { saveGeneralSettings, resetGuildConfig } from './actions';
import { hexToInt, intToHex } from '@/lib/utils';

export interface ModuleStatus {
  name: string;
  enabled: boolean;
  href: string;
}

export function SettingsView({
  guildId,
  initial,
  modules,
  guildName,
}: {
  guildId: string;
  initial: { embedColor: string; language: string; timezone: string; commandCooldownSeconds: number };
  modules: ModuleStatus[];
  guildName: string;
}) {
  const [state, setState] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const [resetOpen, setResetOpen] = React.useState(false);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Embed branding, locale and command behavior.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Embed color" htmlFor="s-color" hint="Default accent for Nexora embeds.">
              <div className="flex items-center gap-2">
                <input
                  id="s-color"
                  type="color"
                  value={state.embedColor}
                  onChange={(e) => setState((s) => ({ ...s, embedColor: e.target.value }))}
                  className="h-9 w-16 cursor-pointer rounded-lg border border-input bg-background p-1 focus-ring"
                />
                <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{state.embedColor.toUpperCase()}</code>
              </div>
            </FormField>
            <FormField label="Language" htmlFor="s-lang">
              <Select
                id="s-lang"
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'es', label: 'Español' },
                  { value: 'fr', label: 'Français' },
                  { value: 'de', label: 'Deutsch' },
                  { value: 'pt', label: 'Português' },
                ]}
                value={state.language}
                onChange={(e) => setState((s) => ({ ...s, language: e.target.value }))}
              />
            </FormField>
            <FormField label="Timezone" htmlFor="s-tz">
              <Select
                id="s-tz"
                options={[
                  'UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London',
                  'Europe/Berlin', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Singapore', 'Australia/Sydney',
                ].map((tz) => ({ value: tz, label: tz.replace('_', ' ') }))}
                value={state.timezone}
                onChange={(e) => setState((s) => ({ ...s, timezone: e.target.value }))}
              />
            </FormField>
            <FormField label="Command cooldown (s)" htmlFor="s-cooldown">
              <Input
                id="s-cooldown"
                type="number"
                min={0}
                max={3600}
                value={state.commandCooldownSeconds}
                onChange={(e) => setState((s) => ({ ...s, commandCooldownSeconds: Number(e.target.value) || 0 }))}
              />
            </FormField>
          </div>
          <Button
            onClick={async () => {
              setSaving(true);
              const result = await saveGeneralSettings(guildId, {
                embedColor: hexToInt(state.embedColor),
                language: state.language,
                timezone: state.timezone,
                commandCooldownSeconds: state.commandCooldownSeconds,
              });
              setSaving(false);
              if (result.ok) toast.success('Settings saved');
              else toast.error(result.error);
            }}
            loading={saving}
          >
            <Save className="h-4 w-4" /> Save settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modules</CardTitle>
          <CardDescription>Quick overview — toggle each module on its own page.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {modules.map((m) => (
              <li key={m.name}>
                <a
                  href={m.href}
                  className="flex items-center justify-between rounded-lg border border-border p-3 transition hover:border-primary/40 focus-ring"
                >
                  <span className="text-sm font-medium">{m.name}</span>
                  <span
                    className={`text-xs font-semibold ${m.enabled ? 'text-emerald-500' : 'text-muted-foreground'}`}
                  >
                    {m.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <TriangleAlert className="h-5 w-5" aria-hidden="true" /> Danger zone
          </CardTitle>
          <CardDescription>
            Reset every module configuration for {guildName} to defaults. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setResetOpen(true)}>
            Reset configuration
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset all configuration?"
        description={`Every AutoMod rule, automation, custom command and module setting for ${guildName} will be permanently deleted and re-created with defaults.`}
        confirmLabel="Reset everything"
        destructive
        typeToConfirm={guildName}
        onConfirm={async () => {
          const result = await resetGuildConfig(guildId);
          if (result.ok) toast.success('Configuration reset to defaults');
          else toast.error(result.error);
        }}
      />
    </div>
  );
}
