import type { Guild, Message } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import { prisma, type LevelConfig } from '@nexora/database';
import { parseTemplate } from '@nexora/discord';
import { serializeError } from '@nexora/logger';
import { getContext } from '../core/context';
import { ensureGuildMember } from '../core/guilds';
import { randomInt, safeJsonParse, truncate } from '../core/utils';
import { dispatchAutomationTrigger } from './automations';
import { enqueueWebhookEvent } from './webhooks';
import { incrementAnalytics } from './analytics';

/**
 * Leveling formula (documented contract):
 *   level(xp)   = floor(0.1 * sqrt(totalXp))
 *   xpForLevel(l) = (l * 10)^2  →  level 10 at 1,000 XP, level 50 at 25,000 XP.
 * GuildMember.xp holds the denormalized total; the Level row additionally
 * tracks progress inside the current level.
 */
export function levelFromXp(totalXp: number): number {
  return Math.floor(0.1 * Math.sqrt(Math.max(totalXp, 0)));
}

export function xpForLevel(level: number): number {
  return 100 * level * level;
}

interface RoleMultiplier {
  roleId: string;
  multiplier: number;
}

interface RoleReward {
  level: number;
  roleId: string;
  keepPrevious: boolean;
}

const configCache = new Map<string, { config: LevelConfig; expiresAt: number }>();
const CONFIG_TTL_MS = 60_000;

export function invalidateLevelConfigCache(guildId: string): void {
  configCache.delete(guildId);
}

async function getLevelConfig(guildId: string): Promise<LevelConfig> {
  const cached = configCache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) return cached.config;
  const config = await prisma.levelConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
  configCache.set(guildId, { config, expiresAt: Date.now() + CONFIG_TTL_MS });
  return config;
}

export interface RankInfo {
  xp: number;
  level: number;
  levelXp: number; // progress inside current level
  nextLevelXp: number; // total XP required for the next level
  position: number;
}

export async function getRank(guildId: string, userId: string): Promise<RankInfo | null> {
  const memberRow = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId, guildId } },
  });
  if (!memberRow) return null;
  const level = levelFromXp(memberRow.xp);
  const currentLevelFloor = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const position = await prisma.guildMember.count({
    where: { guildId, leftAt: null, xp: { gt: memberRow.xp } },
  });
  return {
    xp: memberRow.xp,
    level,
    levelXp: memberRow.xp - currentLevelFloor,
    nextLevelXp: nextLevelXp - currentLevelFloor,
    position: position + 1,
  };
}

export async function getLeaderboard(guildId: string, limit = 10): Promise<{ userId: string; xp: number }[]> {
  const rows = await prisma.guildMember.findMany({
    where: { guildId, leftAt: null },
    orderBy: { xp: 'desc' },
    take: limit,
    select: { userId: true, xp: true },
  });
  return rows;
}

async function applyRoleRewards(guild: Guild, userId: string, newLevel: number, rewards: RoleReward[]): Promise<void> {
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  const sorted = [...rewards].sort((a, b) => b.level - a.level);
  const current = sorted.find((reward) => reward.level <= newLevel);
  if (!current) return;

  const role = guild.roles.cache.get(current.roleId);
  if (!role || role.position >= me.roles.highest.position) return;
  if (!member.roles.cache.has(role.id)) {
    await member.roles.add(role, `Level reward (level ${newLevel})`).catch(() => undefined);
  }

  if (!current.keepPrevious) {
    for (const reward of sorted) {
      if (reward.level >= current.level) continue;
      if (reward.roleId === current.roleId) continue;
      const previous = guild.roles.cache.get(reward.roleId);
      if (previous && member.roles.cache.has(previous.id)) {
        await member.roles.remove(previous, 'Replaced by higher level reward').catch(() => undefined);
      }
    }
  }
}

/**
 * Award XP for a message (called from messageCreate). Also maintains the
 * denormalized GuildMember.messageCount / xp counters, so it runs even when
 * leveling is disabled for the guild.
 */
export async function awardXp(message: Message): Promise<void> {
  if (!message.inGuild()) return;
  const guild = message.guild;
  const userId = message.author.id;
  const { cache, log } = getContext();

  const config = await getLevelConfig(guild.id);
  await ensureGuildMember(guild.id, userId);

  // Message counter (independent of the leveling toggle).
  await prisma.guildMember
    .update({
      where: { userId_guildId: { userId, guildId: guild.id } },
      data: { messageCount: { increment: 1 } },
    })
    .catch(() => undefined);

  if (!config.enabled) return;
  if (config.ignoreChannelIds.includes(message.channelId)) return;

  // Per-user XP cooldown via the shared cache.
  if (config.cooldownSeconds > 0) {
    const count = await cache.incrTtl(`xp:${guild.id}:${userId}`, config.cooldownSeconds);
    if (count > 1) return;
  }

  const multipliers = safeJsonParse<RoleMultiplier[]>(config.multipliers) ?? [];
  const multiplier = message.member
    ? multipliers
        .filter((entry) => message.member?.roles.cache.has(entry.roleId))
        .reduce((max, entry) => Math.max(max, entry.multiplier), 1)
    : 1;
  const gain = Math.max(1, Math.round(randomInt(config.xpMin, config.xpMax) * multiplier));

  // Read-modify-write on the Level row (one row per member).
  const memberRow = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId, guildId: guild.id } },
    select: { id: true },
  });
  if (!memberRow) return;

  const level = await prisma.level.upsert({
    where: { memberId: memberRow.id },
    create: { memberId: memberRow.id, xp: gain, level: 0, totalXp: gain, lastXpAt: new Date() },
    update: { totalXp: { increment: gain }, lastXpAt: new Date() },
  });

  const totalXp = level.totalXp;
  const newLevel = levelFromXp(totalXp);
  const previousLevel = level.level;

  await prisma.level
    .update({
      where: { memberId: memberRow.id },
      data: {
        level: newLevel,
        xp: totalXp - xpForLevel(newLevel),
      },
    })
    .catch((err) => log.warn({ err: serializeError(err) }, 'Level row update failed'));

  await prisma.guildMember
    .update({
      where: { userId_guildId: { userId, guildId: guild.id } },
      data: { xp: totalXp },
    })
    .catch(() => undefined);

  await incrementAnalytics(guild.id, { newXp: gain }).catch(() => undefined);

  if (newLevel <= previousLevel) return;

  // ---- Level up ----------------------------------------------------------
  getContext().log.info({ guildId: guild.id, userId, level: newLevel }, 'Member leveled up');

  const rewards = safeJsonParse<RoleReward[]>(config.roleRewards) ?? [];
  if (rewards.length > 0) {
    await applyRoleRewards(guild, userId, newLevel, rewards).catch((err) =>
      log.warn({ err: serializeError(err) }, 'Role reward failed'),
    );
  }

  const templateContext = {
    user: `<@${userId}>`,
    username: message.author.username,
    userid: userId,
    server: guild.name,
    level: newLevel,
    xp: totalXp,
    channel: `<#${message.channelId}>`,
  };

  if (config.announceChannelId) {
    const channel = await getContext().client.channels.fetch(config.announceChannelId).catch(() => null);
    if (channel?.isSendable()) {
      await channel
        .send({ content: truncate(parseTemplate(config.announceTemplate, templateContext), 2000) })
        .catch(() => undefined);
    }
  }
  if (config.dmEnabled) {
    await message.author.send({ content: truncate(parseTemplate(config.dmTemplate, templateContext), 2000) }).catch(() => undefined);
  }

  await dispatchAutomationTrigger(guild, 'LEVEL_REACHED', { userId, level: newLevel, channel: message.channel }).catch((err) =>
    log.warn({ err: serializeError(err) }, 'LEVEL_REACHED automation dispatch failed'),
  );
  await enqueueWebhookEvent(guild.id, 'level.up', { userId, level: newLevel, totalXp });
}
