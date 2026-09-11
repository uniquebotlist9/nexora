'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Lock, Save } from 'lucide-react';
import type { MessagePayload } from '@nexora/types';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageBuilder } from '@/components/shared/message-builder';
import { PlanGate } from '@/components/shared/plan-gate';
import type { GuildOption } from '@/components/shared/guild-selects';
import { ChannelSelect, RoleMultiSelect } from '@/components/shared/guild-selects';
import { upsertGuildConfig } from '@/app/dashboard/g/[guildId]/_lib/config-actions';

export interface WelcomeEditorState {
  welcomeEnabled: boolean;
  welcomeChannelId: string | null;
  welcomeMessage: MessagePayload | null;
  welcomeDmEnabled: boolean;
  welcomeDmMessage: MessagePayload | null;
  welcomeCardEnabled: boolean;
  autoRoleIds: string[];
  farewellEnabled: boolean;
  farewellChannelId: string | null;
  farewellMessage: MessagePayload | null;
  farewellCardEnabled: boolean;
}

export function WelcomeGoodbyeEditor({
  guildId,
  mode,
  initial,
  channels,
  roles,
  cardsUnlocked,
}: {
  guildId: string;
  mode: 'welcome' | 'goodbye';
  initial: WelcomeEditorState;
  channels: GuildOption[];
  roles: GuildOption[];
  cardsUnlocked: boolean;
}) {
  const isWelcome = mode === 'welcome';
  const [state, setState] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);

  const patch = (p: Partial<WelcomeEditorState>) => setState((s) => ({ ...s, ...p }));

  const save = async () => {
    setSaving(true);
    const payload = isWelcome
      ? {
          welcomeEnabled: state.welcomeEnabled,
          welcomeChannelId: state.welcomeChannelId,
          welcomeMessage: state.welcomeMessage ?? undefined,
          welcomeDmEnabled: state.welcomeDmEnabled,
          welcomeDmMessage: state.welcomeDmMessage ?? undefined,
          welcomeCardEnabled: state.welcomeCardEnabled,
          autoRoleIds: state.autoRoleIds,
        }
      : {
          farewellEnabled: state.farewellEnabled,
          farewellChannelId: state.farewellChannelId,
          farewellMessage: state.farewellMessage ?? undefined,
          farewellCardEnabled: state.farewellCardEnabled,
        };
    const result = await upsertGuildConfig(guildId, 'welcome', payload);
    setSaving(false);
    if (result.ok) toast.success(`${isWelcome ? 'Welcome' : 'Goodbye'} settings saved`);
    else toast.error(result.error);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold">{isWelcome ? 'Welcome messages' : 'Goodbye messages'}</p>
            <p className="text-sm text-muted-foreground">
              {isWelcome
                ? 'Greets new members with a message, DM, image card and auto-roles.'
                : 'Says goodbye to departing members in a channel of your choice.'}
            </p>
          </div>
          <Switch
            checked={isWelcome ? state.welcomeEnabled : state.farewellEnabled}
            onCheckedChange={(v) => patch(isWelcome ? { welcomeEnabled: v } : { farewellEnabled: v })}
            aria-label={isWelcome ? 'Enable welcome messages' : 'Enable goodbye messages'}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Channel message</CardTitle>
          <CardDescription>
            Posted when a member {isWelcome ? 'joins' : 'leaves'}. Variables render with live sample data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-1.5">
            <label htmlFor={`wg-channel-${mode}`} className="text-sm font-medium">
              Channel
            </label>
            <ChannelSelect
              id={`wg-channel-${mode}`}
              channels={channels}
              onlyText
              value={isWelcome ? state.welcomeChannelId : state.farewellChannelId}
              onChange={(v) => patch(isWelcome ? { welcomeChannelId: v ?? null } : { farewellChannelId: v ?? null })}
              placeholder="No channel selected"
            />
          </div>
          <MessageBuilder
            value={isWelcome ? (state.welcomeMessage ?? {}) : (state.farewellMessage ?? {})}
            onChange={(message) =>
              patch(
                isWelcome
                  ? { welcomeMessage: message.content || message.embed ? message : null }
                  : { farewellMessage: message.content || message.embed ? message : null },
              )
            }
          />
        </CardContent>
      </Card>

      {isWelcome && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Direct message</CardTitle>
              <CardDescription>Sent privately to the new member on join.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <label htmlFor="wg-dm" className="text-sm font-medium">Send DM</label>
                <Switch
                  id="wg-dm"
                  checked={state.welcomeDmEnabled}
                  onCheckedChange={(welcomeDmEnabled) => patch({ welcomeDmEnabled })}
                />
              </div>
              <MessageBuilder
                value={state.welcomeDmMessage ?? {}}
                onChange={(message) =>
                  patch({ welcomeDmMessage: message.content || message.embed ? message : null })
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Auto-roles</CardTitle>
              <CardDescription>Granted to every new member on join (max 10).</CardDescription>
            </CardHeader>
            <CardContent>
              <RoleMultiSelect
                roles={roles}
                value={state.autoRoleIds}
                onChange={(autoRoleIds) => patch({ autoRoleIds })}
                placeholder="No auto-roles"
              />
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Image card
            {!cardsUnlocked && <Lock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
          </CardTitle>
          <CardDescription>
            A generated {isWelcome ? 'welcome' : 'goodbye'} banner image attached to the message.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlanGate
            locked={!cardsUnlocked}
            feature="Image cards"
            requiredPlan="PRO"
            blur={false}
            className="rounded-xl"
          >
            <div className="flex items-center justify-between rounded-xl border border-border p-4">
              <p className="text-sm">Generate and attach an image card</p>
              <Switch
                checked={isWelcome ? state.welcomeCardEnabled : state.farewellCardEnabled}
                onCheckedChange={(v) =>
                  patch(isWelcome ? { welcomeCardEnabled: v } : { farewellCardEnabled: v })
                }
                aria-label="Enable image card"
              />
            </div>
          </PlanGate>
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
