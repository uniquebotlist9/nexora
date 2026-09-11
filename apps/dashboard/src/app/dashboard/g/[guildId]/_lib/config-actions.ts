'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@nexora/database';
import { assertGuildAccess } from '@/lib/guild';
import { ok, err, type ActionResult } from '@/lib/result';

/**
 * Generic upsert for per-guild single-row config models (AntiRaidConfig,
 * VerificationConfig, LevelConfig, EconomyConfig, WelcomeConfig, LogConfig,
 * TicketConfig). `create` supplies required defaults for the first write.
 */
export async function upsertGuildConfig(
  guildId: string,
  model:
    | 'antiRaid'
    | 'verification'
    | 'leveling'
    | 'economy'
    | 'welcome'
    | 'logConfig'
    | 'ticketConfig',
  data: Record<string, unknown>,
  createExtra: Record<string, unknown> = {},
): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;

  try {
    switch (model) {
      case 'antiRaid':
        await prisma.antiRaidConfig.upsert({ where: { guildId }, create: { guildId, ...createExtra, ...data } as never, update: data as never });
        break;
      case 'verification':
        await prisma.verificationConfig.upsert({ where: { guildId }, create: { guildId, ...createExtra, ...data } as never, update: data as never });
        break;
      case 'leveling':
        await prisma.levelConfig.upsert({ where: { guildId }, create: { guildId, ...createExtra, ...data } as never, update: data as never });
        break;
      case 'economy':
        await prisma.economyConfig.upsert({ where: { guildId }, create: { guildId, ...createExtra, ...data } as never, update: data as never });
        break;
      case 'welcome':
        await prisma.welcomeConfig.upsert({ where: { guildId }, create: { guildId, ...createExtra, ...data } as never, update: data as never });
        break;
      case 'logConfig':
        await prisma.logConfig.upsert({ where: { guildId }, create: { guildId, ...createExtra, ...data } as never, update: data as never });
        break;
      case 'ticketConfig':
        await prisma.ticketConfig.upsert({ where: { guildId }, create: { guildId, ...createExtra, ...data } as never, update: data as never });
        break;
    }
    await prisma.auditLog.create({
      data: { actorType: 'USER', guildId, action: `${model}.config_updated`, targetType: 'GUILD_CONFIG' },
    });
    revalidatePath(`/dashboard/g/${guildId}`);
    return ok();
  } catch {
    return err('Could not save the configuration. Please try again.');
  }
}

/** Audit-log helper for feature-specific events (deploys, backups, ...). */
export async function writeAudit(
  guildId: string,
  action: string,
  targetId?: string,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: { actorType: 'USER', guildId, action, targetType: 'FEATURE', targetId },
    });
  } catch {
    // Audit logging is best-effort.
  }
}
