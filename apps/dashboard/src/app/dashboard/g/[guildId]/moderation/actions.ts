'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@nexora/database';
import { escalationConfigSchema } from '@nexora/validation';
import { assertGuildAccess } from '@/lib/guild';
import { ok, err, zodFieldErrors, type ActionResult } from '@/lib/result';

export interface EscalationStep {
  warnings: number;
  action: 'timeout' | 'kick' | 'tempban' | 'ban';
  durationMinutes?: number;
}

export interface EscalationConfig {
  steps: EscalationStep[];
  resetOnEscalate: boolean;
}

/**
 * Save the warning-escalation ladder on GuildSettings.escalating.
 * The bot reads this config whenever a warning is issued.
 */
export async function saveEscalationConfig(
  guildId: string,
  config: EscalationConfig,
): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;

  const parsed = escalationConfigSchema.safeParse(config);
  if (!parsed.success) {
    return err('Invalid escalation configuration', zodFieldErrors(parsed.error));
  }

  try {
    await prisma.guildSettings.upsert({
      where: { guildId },
      create: { guildId, escalating: parsed.data },
      update: { escalating: parsed.data },
    });
    await prisma.auditLog.create({
      data: {
        actorType: 'USER',
        guildId,
        action: 'moderation.escalation_config_updated',
        targetType: 'GUILD_SETTINGS',
      },
    });
    revalidatePath(`/dashboard/g/${guildId}/moderation`);
    return ok();
  } catch {
    return err('Could not save the escalation configuration. Please try again.');
  }
}

/** Update the mod-log channel id on GuildSettings. */
export async function saveModLogChannel(guildId: string, channelId: string | undefined): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;
  try {
    await prisma.guildSettings.upsert({
      where: { guildId },
      create: { guildId, modLogChannelId: channelId ?? null },
      update: { modLogChannelId: channelId ?? null },
    });
    revalidatePath(`/dashboard/g/${guildId}/moderation`);
    return ok();
  } catch {
    return err('Could not save the mod-log channel.');
  }
}
