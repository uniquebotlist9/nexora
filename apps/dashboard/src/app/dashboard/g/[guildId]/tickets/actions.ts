'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@nexora/database';
import { ticketConfigInputSchema } from '@nexora/validation';
import { assertGuildAccess } from '@/lib/guild';
import { ok, err, zodFieldErrors, type ActionResult } from '@/lib/result';

export interface TicketTypeInput {
  id: string;
  name: string;
  description: string;
  emoji?: string;
  categoryId?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}

export interface TicketConfigInput {
  enabled: boolean;
  channelId?: string;
  transcriptChannelId?: string;
  staffRoleIds: string[];
  blacklist: string[];
  types: TicketTypeInput[];
  inactivityHours: number;
  claimRequired: boolean;
}

/** Save the full ticket configuration (types, staff, blacklist, ...). */
export async function saveTicketConfig(guildId: string, input: TicketConfigInput): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;

  const parsed = ticketConfigInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid ticket configuration', zodFieldErrors(parsed.error));

  try {
    await prisma.ticketConfig.upsert({
      where: { guildId },
      create: {
        guildId,
        enabled: parsed.data.enabled,
        panelChannelId: parsed.data.channelId,
        transcriptChannelId: parsed.data.transcriptChannelId,
        staffRoleIds: parsed.data.staffRoleIds,
        blacklist: parsed.data.blacklist,
        types: parsed.data.types,
        inactivityHours: parsed.data.inactivityHours,
        claimRequired: parsed.data.claimRequired,
      },
      update: {
        enabled: parsed.data.enabled,
        panelChannelId: parsed.data.channelId,
        transcriptChannelId: parsed.data.transcriptChannelId,
        staffRoleIds: parsed.data.staffRoleIds,
        blacklist: parsed.data.blacklist,
        types: parsed.data.types,
        inactivityHours: parsed.data.inactivityHours,
        claimRequired: parsed.data.claimRequired,
      },
    });
    revalidatePath(`/dashboard/g/${guildId}/tickets`);
    return ok();
  } catch {
    return err('Could not save the ticket configuration.');
  }
}

/**
 * Deploy (or redeploy) the ticket panel message.
 *
 * BOT HANDOFF: the dashboard never talks to Discord directly. It enqueues a
 * ScheduledTask row with kind='TICKET_PANEL_DEPLOY'; the bot's scheduler
 * worker claims pending tasks (lockedAt) and posts/updates the panel message
 * in the configured channel, writing panelMessageId back to TicketConfig.
 */
export async function deployTicketPanel(guildId: string): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;

  const config = await prisma.ticketConfig.findUnique({ where: { guildId } });
  if (!config?.panelChannelId) {
    return err('Pick a panel channel before deploying.');
  }
  if (!config.enabled) {
    return err('Enable the ticket system before deploying the panel.');
  }

  try {
    await prisma.scheduledTask.create({
      data: {
        guildId,
        kind: 'TICKET_PANEL_DEPLOY',
        payload: {
          panelChannelId: config.panelChannelId,
          types: config.types,
          existingMessageId: config.panelMessageId,
        },
        runAt: new Date(),
      },
    });
    await prisma.auditLog.create({
      data: { actorType: 'USER', guildId, action: 'tickets.panel_deploy_requested', targetType: 'TICKET_PANEL' },
    });
    revalidatePath(`/dashboard/g/${guildId}/tickets`);
    return ok();
  } catch {
    return err('Could not queue the panel deployment.');
  }
}

/** Add a user ID to the ticket blacklist. */
export async function addToBlacklist(guildId: string, userId: string): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;
  if (!/^\d{15,21}$/.test(userId)) return err('That is not a valid Discord user ID.');
  try {
    await prisma.ticketConfig.upsert({
      where: { guildId },
      create: { guildId, blacklist: [userId] },
      update: { blacklist: { push: userId } },
    });
    revalidatePath(`/dashboard/g/${guildId}/tickets`);
    return ok();
  } catch {
    return err('Could not update the blacklist.');
  }
}

export async function removeFromBlacklist(guildId: string, userId: string): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;
  try {
    const config = await prisma.ticketConfig.findUnique({ where: { guildId } });
    if (!config) return ok();
    await prisma.ticketConfig.update({
      where: { guildId },
      data: { blacklist: config.blacklist.filter((id) => id !== userId) },
    });
    revalidatePath(`/dashboard/g/${guildId}/tickets`);
    return ok();
  } catch {
    return err('Could not update the blacklist.');
  }
}
