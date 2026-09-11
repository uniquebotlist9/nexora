'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@nexora/database';
import { assertGuildAccess } from '@/lib/guild';
import { ok, err, type ActionResult } from '@/lib/result';

export interface ReactionRoleOptionInput {
  roleId: string;
  label: string;
  description?: string;
  emoji?: string;
}

export interface PanelInput {
  channelId: string;
  title: string;
  style: 'BUTTON' | 'DROPDOWN' | 'REACTION';
  options: ReactionRoleOptionInput[];
  singleChoice: boolean;
}

/**
 * Create a reaction-role panel.
 *
 * BOT HANDOFF: creating the row alone doesn't post anything — call
 * deployReactionRolePanel, which enqueues a ScheduledTask
 * (kind REACTION_ROLE_PANEL_DEPLOY). The bot's scheduler posts the message
 * and fills in messageId.
 */
export async function createReactionRolePanel(guildId: string, input: PanelInput): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;

  if (!input.title.trim()) return err('A panel title is required.');
  if (!input.channelId) return err('Pick a channel for the panel.');
  if (input.options.length === 0) return err('Add at least one role option.');

  try {
    await prisma.reactionRoleMessage.create({
      data: {
        guildId,
        channelId: input.channelId,
        messageId: `pending-${Date.now()}`,
        style: input.style,
        title: input.title,
        // Json column — strip the interface type (matches config-actions casts).
        options: input.options as never,
        singleChoice: input.singleChoice,
      },
    });
    revalidatePath(`/dashboard/g/${guildId}/reaction-roles`);
    return ok();
  } catch {
    return err('Could not create the panel.');
  }
}

export async function deployReactionRolePanel(guildId: string, panelId: string): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;
  const panel = await prisma.reactionRoleMessage.findFirst({ where: { id: panelId, guildId } });
  if (!panel) return err('Panel not found.');
  try {
    await prisma.scheduledTask.create({
      data: {
        guildId,
        kind: 'REACTION_ROLE_PANEL_DEPLOY',
        payload: { panelId },
        runAt: new Date(),
      },
    });
    await prisma.auditLog.create({
      data: { actorType: 'USER', guildId, action: 'reaction_roles.panel_deploy_requested', targetType: 'REACTION_ROLE_PANEL', targetId: panelId },
    });
    revalidatePath(`/dashboard/g/${guildId}/reaction-roles`);
    return ok();
  } catch {
    return err('Could not queue the panel deployment.');
  }
}

export async function deleteReactionRolePanel(guildId: string, panelId: string): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;
  try {
    await prisma.reactionRoleMessage.deleteMany({ where: { id: panelId, guildId } });
    revalidatePath(`/dashboard/g/${guildId}/reaction-roles`);
    return ok();
  } catch {
    return err('Could not delete the panel.');
  }
}
