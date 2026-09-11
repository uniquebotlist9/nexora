'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@nexora/database';
import { assertGuildAccess } from '@/lib/guild';
import { ok, err, type ActionResult } from '@/lib/result';

export interface GeneralSettingsInput {
  embedColor: number;
  language: string;
  timezone: string;
  commandCooldownSeconds: number;
}

export async function saveGeneralSettings(guildId: string, input: GeneralSettingsInput): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;

  if (input.embedColor < 0 || input.embedColor > 0xffffff) return err('Embed color is out of range.');
  if (input.commandCooldownSeconds < 0 || input.commandCooldownSeconds > 3600) {
    return err('Command cooldown must be between 0 and 3600 seconds.');
  }

  try {
    await prisma.guildSettings.upsert({
      where: { guildId },
      create: {
        guildId,
        embedColor: input.embedColor,
        language: input.language,
        timezone: input.timezone,
        commandCooldownSeconds: input.commandCooldownSeconds,
      },
      update: {
        embedColor: input.embedColor,
        language: input.language,
        timezone: input.timezone,
        commandCooldownSeconds: input.commandCooldownSeconds,
      },
    });
    revalidatePath(`/dashboard/g/${guildId}/settings`);
    return ok();
  } catch {
    return err('Could not save the settings.');
  }
}

/**
 * Danger zone: reset the guild's configuration to defaults.
 * Wipes all module configs (automod, tickets, leveling, ...) — the bot picks
 * up the reset and re-syncs defaults on next boot.
 */
export async function resetGuildConfig(guildId: string): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;

  try {
    await prisma.$transaction([
      prisma.autoModRule.deleteMany({ where: { guildId } }),
      prisma.automation.deleteMany({ where: { guildId } }),
      prisma.customCommand.deleteMany({ where: { guildId } }),
      prisma.welcomeConfig.deleteMany({ where: { guildId } }),
      prisma.logConfig.deleteMany({ where: { guildId } }),
      prisma.ticketConfig.deleteMany({ where: { guildId } }),
      prisma.levelConfig.deleteMany({ where: { guildId } }),
      prisma.economyConfig.deleteMany({ where: { guildId } }),
      prisma.verificationConfig.deleteMany({ where: { guildId } }),
      prisma.antiRaidConfig.deleteMany({ where: { guildId } }),
      prisma.guildSettings.deleteMany({ where: { guildId } }),
    ]);
    await prisma.auditLog.create({
      data: { actorType: 'USER', guildId, action: 'settings.config_reset', targetType: 'GUILD' },
    });
    revalidatePath(`/dashboard/g/${guildId}`);
    return ok();
  } catch {
    return err('Could not reset the configuration.');
  }
}
