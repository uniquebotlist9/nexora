'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@nexora/database';
import { automationInputSchema } from '@nexora/validation';
import type { MessagePayload } from '@nexora/types';
import { assertGuildAccess } from '@/lib/guild';
import { ok, err, zodFieldErrors, type ActionResult } from '@/lib/result';

export interface AutomationTriggerInput {
  type: string;
  config: {
    keywords?: string[];
    roleId?: string;
    level?: number;
    intervalMinutes?: number;
    cron?: string;
    memberCount?: number;
  };
}

export interface AutomationActionInput {
  type: string;
  config: {
    channelId?: string;
    message?: MessagePayload;
    roleId?: string;
    durationMinutes?: number;
    channelName?: string;
    nickname?: string;
    ticketType?: string;
  };
}

export interface AutomationInput {
  name: string;
  enabled: boolean;
  trigger: AutomationTriggerInput;
  actions: AutomationActionInput[];
}

export async function createAutomation(guildId: string, input: AutomationInput): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;

  const parsed = automationInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid automation configuration', zodFieldErrors(parsed.error));

  try {
    const automation = await prisma.automation.create({
      data: {
        guildId,
        name: parsed.data.name,
        enabled: parsed.data.enabled,
        trigger: parsed.data.trigger.type as never,
        triggerConfig: parsed.data.trigger.config,
        actions: parsed.data.actions,
      },
    });
    // SCHEDULED triggers run via the bot's task scheduler — register the first run.
    if (parsed.data.trigger.type === 'SCHEDULED') {
      const interval = parsed.data.trigger.config.intervalMinutes ?? 60;
      await prisma.scheduledTask.create({
        data: {
          guildId,
          kind: 'AUTOMATION',
          payload: { automationId: automation.id, rescheduleIntervalMinutes: interval },
          runAt: new Date(Date.now() + interval * 60_000),
        },
      });
    }
    revalidatePath(`/dashboard/g/${guildId}/automations`);
    return ok();
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return err('An automation with that name already exists.');
    return err('Could not create the automation.');
  }
}

export async function updateAutomation(
  guildId: string,
  automationId: string,
  input: AutomationInput,
): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;

  const parsed = automationInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid automation configuration', zodFieldErrors(parsed.error));

  try {
    await prisma.automation.update({
      where: { id: automationId },
      data: {
        name: parsed.data.name,
        enabled: parsed.data.enabled,
        trigger: parsed.data.trigger.type as never,
        triggerConfig: parsed.data.trigger.config,
        actions: parsed.data.actions,
      },
    });
    revalidatePath(`/dashboard/g/${guildId}/automations`);
    return ok();
  } catch {
    return err('Could not update the automation.');
  }
}

export async function deleteAutomation(guildId: string, automationId: string): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;
  try {
    await prisma.automation.deleteMany({ where: { id: automationId, guildId } });
    revalidatePath(`/dashboard/g/${guildId}/automations`);
    return ok();
  } catch {
    return err('Could not delete the automation.');
  }
}

export async function toggleAutomation(
  guildId: string,
  automationId: string,
  enabled: boolean,
): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;
  try {
    await prisma.automation.updateMany({ where: { id: automationId, guildId }, data: { enabled } });
    revalidatePath(`/dashboard/g/${guildId}/automations`);
    return ok();
  } catch {
    return err('Could not toggle the automation.');
  }
}
