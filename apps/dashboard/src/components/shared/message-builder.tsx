'use client';

import * as React from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import type { EmbedData, MessagePayload } from '@nexora/types';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { FormField } from '@/components/ui/form';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DiscordPreview, applyVariables } from '@/components/shared/discord-preview';
import { cn, intToHex, hexToInt } from '@/lib/utils';

const SAMPLE_VARIABLES: Record<string, string> = {
  user: '@NewMember',
  username: 'NewMember',
  server: 'Nexora Community',
  memberCount: '12,345',
  channel: 'general',
};

interface MessageBuilderProps {
  value: MessagePayload;
  onChange: (value: MessagePayload) => void;
  /** Sample data used for the live preview. */
  variables?: Record<string, string>;
  className?: string;
}

/**
 * Visual message + embed builder with a live Discord-style preview.
 * The produced payload matches @nexora/types MessagePayload and is validated
 * against @nexora/validation messagePayloadSchema on the server.
 */
export function MessageBuilder({ value, onChange, variables = SAMPLE_VARIABLES, className }: MessageBuilderProps) {
  const embed = value.embed;
  const fields = embed?.fields ?? [];

  const setEmbed = (next: EmbedData | undefined) => onChange({ ...value, embed: next });

  const updateEmbed = (patch: Partial<EmbedData>) => {
    const base = embed ?? {};
    setEmbed({ ...base, ...patch });
  };

  const moveField = (index: number, dir: -1 | 1) => {
    if (!embed) return;
    const next = [...fields];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    updateEmbed({ fields: next });
  };

  return (
    <div className={cn('grid gap-5 lg:grid-cols-2', className)}>
      <div className="space-y-4">
        <FormField label="Plain message content" htmlFor="mb-content">
          <Textarea
            id="mb-content"
            value={value.content ?? ''}
            onChange={(e) => onChange({ ...value, content: e.target.value || undefined })}
            placeholder="Welcome {user} to {server}! 🎉"
            rows={3}
          />
        </FormField>

        <div className="rounded-xl border border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold">Embed</h4>
              <Switch
                checked={Boolean(embed)}
                onCheckedChange={(on) => setEmbed(on ? { title: 'New embed' } : undefined)}
                aria-label="Toggle embed"
              />
            </div>
          </div>

          {embed && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <FormField label="Title" htmlFor="mb-title">
                  <Input
                    id="mb-title"
                    value={embed.title ?? ''}
                    onChange={(e) => updateEmbed({ title: e.target.value || undefined })}
                    placeholder="Welcome!"
                    maxLength={256}
                  />
                </FormField>
                <FormField label="Accent color" htmlFor="mb-color">
                  <input
                    id="mb-color"
                    type="color"
                    value={intToHex(embed.color)}
                    onChange={(e) => updateEmbed({ color: hexToInt(e.target.value) })}
                    className="h-9 w-16 cursor-pointer rounded-lg border border-input bg-background p-1 focus-ring"
                  />
                </FormField>
              </div>

              <FormField label="Description" htmlFor="mb-desc" hint="Supports {user}, {server}, {memberCount} variables.">
                <Textarea
                  id="mb-desc"
                  value={embed.description ?? ''}
                  onChange={(e) => updateEmbed({ description: e.target.value || undefined })}
                  placeholder="Hey {user}, glad to have you here!"
                  rows={4}
                  maxLength={4096}
                />
              </FormField>

              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Footer text" htmlFor="mb-footer">
                  <Input
                    id="mb-footer"
                    value={embed.footer?.text ?? ''}
                    onChange={(e) =>
                      updateEmbed({ footer: e.target.value ? { text: e.target.value } : undefined })
                    }
                    placeholder="You are member #{memberCount}"
                    maxLength={2048}
                  />
                </FormField>
                <FormField label="Thumbnail URL" htmlFor="mb-thumb">
                  <Input
                    id="mb-thumb"
                    type="url"
                    value={embed.thumbnail ?? ''}
                    onChange={(e) => updateEmbed({ thumbnail: e.target.value || undefined })}
                    placeholder="https://…"
                  />
                </FormField>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                <label htmlFor="mb-timestamp" className="text-sm font-medium">
                  Show timestamp
                </label>
                <Switch
                  id="mb-timestamp"
                  checked={Boolean(embed.timestamp)}
                  onCheckedChange={(on) => updateEmbed({ timestamp: on || undefined })}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h5 className="text-sm font-semibold">Fields ({fields.length}/25)</h5>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={fields.length >= 25}
                    onClick={() => updateEmbed({ fields: [...fields, { name: 'Field name', value: 'Field value', inline: true }] })}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add field
                  </Button>
                </div>
                {fields.map((field, i) => (
                  <div key={i} className="space-y-2 rounded-lg border border-border p-2.5">
                    <div className="flex items-center gap-1.5">
                      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <Input
                        value={field.name}
                        onChange={(e) => {
                          const next = [...fields];
                          next[i] = { ...field, name: e.target.value };
                          updateEmbed({ fields: next });
                        }}
                        placeholder="Field name"
                        aria-label={`Field ${i + 1} name`}
                        maxLength={256}
                      />
                      <div className="flex shrink-0 gap-0.5">
                        <Button type="button" variant="ghost" size="icon" aria-label={`Move field ${i + 1} up`} disabled={i === 0} onClick={() => moveField(i, -1)}>
                          ↑
                        </Button>
                        <Button type="button" variant="ghost" size="icon" aria-label={`Move field ${i + 1} down`} disabled={i === fields.length - 1} onClick={() => moveField(i, 1)}>
                          ↓
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove field ${i + 1}`}
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => updateEmbed({ fields: fields.filter((_, j) => j !== i) })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <Input
                      value={field.value}
                      onChange={(e) => {
                        const next = [...fields];
                        next[i] = { ...field, value: e.target.value };
                        updateEmbed({ fields: next });
                      }}
                      placeholder="Field value"
                      aria-label={`Field ${i + 1} value`}
                      maxLength={1024}
                    />
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={Boolean(field.inline)}
                        onCheckedChange={(inline) => {
                          const next = [...fields];
                          next[i] = { ...field, inline };
                          updateEmbed({ fields: next });
                        }}
                        aria-label={`Field ${i + 1} inline`}
                      />
                      <span className="text-xs text-muted-foreground">Inline</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Live preview</h4>
        <DiscordPreview message={value} variables={variables} />
        <div className="rounded-lg border border-dashed border-border p-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Variables
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(variables).map(([name, sample]) => (
              <code
                key={name}
                title={`Renders as "${applyVariables(`{${name}}`, variables)}" (${sample})`}
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
              >
                {`{${name}}`}
              </code>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
