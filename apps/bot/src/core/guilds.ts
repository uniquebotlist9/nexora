import { prisma, type GuildSettings, type Guild as DbGuild } from '@nexora/database';
import { isPlanTier, limitsForPlan, type PlanTier } from '@nexora/types';
import type { Guild } from 'discord.js';

export interface GuildSnapshot {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
  shardId?: number;
}

/**
 * Provisioning: every guild the bot sees gets a Guild row, a GuildSettings
 * row and the default per-feature config rows. Idempotent — safe to call on
 * guildCreate, on ready (re-sync) and lazily from the command handler.
 */
export async function ensureGuild(guild: GuildSnapshot): Promise<DbGuild> {
  const existing = await prisma.guild.upsert({
    where: { id: guild.id },
    create: {
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      memberCount: guild.memberCount,
      shardId: guild.shardId ?? 0,
    },
    update: {
      name: guild.name,
      icon: guild.icon,
      memberCount: guild.memberCount,
      active: true,
      botLeftAt: null,
      ...(guild.shardId !== undefined ? { shardId: guild.shardId } : {}),
    },
  });

  await prisma.guildSettings.upsert({
    where: { guildId: guild.id },
    create: { guildId: guild.id },
    update: {},
  });

  await ensureDefaultConfigs(guild.id);
  return existing;
}

/** Create the per-feature config rows with their schema defaults if missing. */
export async function ensureDefaultConfigs(guildId: string): Promise<void> {
  await prisma.welcomeConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
  await prisma.logConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
  await prisma.antiRaidConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
  await prisma.ticketConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
  await prisma.levelConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
  await prisma.economyConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
  await prisma.verificationConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
  await prisma.suggestionConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
  await prisma.starboardConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
}

/** Upsert the User + GuildMember rows behind a Discord membership. */
export async function ensureGuildMember(
  guildId: string,
  userId: string,
  joinedAt?: Date | null,
): Promise<void> {
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId },
    update: { lastSeenAt: new Date() },
  });
  await prisma.guildMember.upsert({
    where: { userId_guildId: { userId, guildId } },
    create: { userId, guildId, ...(joinedAt ? { joinedAt } : {}) },
    update: { leftAt: null },
  });
}

/** Guilds larger than this skip the startup member backfill (chunk fetch cost). */
const MEMBER_SYNC_LIMIT = 1000;

/**
 * Mirror a guild's roles + channels into the cache tables: upsert every
 * current entry (picking up changes made while the bot was offline) and
 * prune rows whose Discord entity no longer exists. Idempotent — called
 * from guildCreate and on ready so a fresh database self-heals.
 */
export async function syncGuildStructure(guild: Guild): Promise<void> {
  const roles = [...guild.roles.cache.values()].map((role) => ({
    id: role.id,
    name: role.name,
    position: role.position,
    color: role.color,
  }));
  for (const role of roles) {
    await prisma.role
      .upsert({
        where: { id_guildId: { id: role.id, guildId: guild.id } },
        create: { id: role.id, guildId: guild.id, name: role.name, position: role.position, color: role.color },
        update: { name: role.name, position: role.position, color: role.color },
      })
      .catch(() => undefined);
  }
  // The length guard keeps an unexpectedly empty cache from wiping the table.
  if (roles.length > 0) {
    await prisma.role
      .deleteMany({ where: { guildId: guild.id, id: { notIn: roles.map((role) => role.id) } } })
      .catch(() => undefined);
  }

  const channels = [...guild.channels.cache.values()]
    .filter((channel) => !channel.isThread())
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: String(channel.type),
      position: channel.rawPosition,
    }));
  for (const channel of channels) {
    await prisma.channel
      .upsert({
        where: { id_guildId: { id: channel.id, guildId: guild.id } },
        create: {
          id: channel.id,
          guildId: guild.id,
          name: channel.name,
          type: channel.type,
          position: channel.position,
        },
        update: { name: channel.name, type: channel.type, position: channel.position },
      })
      .catch(() => undefined);
  }
  if (channels.length > 0) {
    await prisma.channel
      .deleteMany({ where: { guildId: guild.id, id: { notIn: channels.map((channel) => channel.id) } } })
      .catch(() => undefined);
  }
}

/**
 * Backfill GuildMember rows by fetching the member list. Guilds above
 * MEMBER_SYNC_LIMIT stay event-driven (rows appear on join, economy,
 * leveling and ticket activity) to keep startup cheap.
 */
export async function syncGuildMembers(guild: Guild): Promise<void> {
  if (guild.memberCount > MEMBER_SYNC_LIMIT) return;
  const members = await guild.members.fetch();
  const memberIds = [...members.keys()];
  for (const member of members.values()) {
    await ensureGuildMember(guild.id, member.id, member.joinedAt).catch(() => undefined);
  }
  // Members that left while the bot was offline are still marked present.
  if (memberIds.length > 0) {
    await prisma.guildMember
      .updateMany({
        where: { guildId: guild.id, leftAt: null, userId: { notIn: memberIds } },
        data: { leftAt: new Date() },
      })
      .catch(() => undefined);
  }
}

/** Mark a guild as left by the bot (kept for history/analytics). */
export async function markGuildLeft(guildId: string): Promise<void> {
  await prisma.guild
    .update({
      where: { id: guildId },
      data: { active: false, botLeftAt: new Date() },
    })
    .catch(() => {
      // Guild was never provisioned — nothing to mark.
    });
  await prisma.guildMember
    .updateMany({ where: { guildId, leftAt: null }, data: { leftAt: new Date() } })
    .catch(() => undefined);
}

// ---------------------------------------------------------------------------
// GuildSettings cache (short-lived, process-local)
// ---------------------------------------------------------------------------

const settingsCache = new Map<string, { settings: GuildSettings; expiresAt: number }>();
const SETTINGS_TTL_MS = 30_000;

export async function getGuildSettings(guildId: string): Promise<GuildSettings> {
  const cached = settingsCache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) return cached.settings;

  await prisma.guild.upsert({
    where: { id: guildId },
    create: { id: guildId, name: 'Unknown Guild' },
    update: {},
  });
  const settings = await prisma.guildSettings.upsert({
    where: { guildId },
    create: { guildId },
    update: {},
  });
  settingsCache.set(guildId, { settings, expiresAt: Date.now() + SETTINGS_TTL_MS });
  return settings;
}

export function invalidateGuildSettings(guildId: string): void {
  settingsCache.delete(guildId);
}

// ---------------------------------------------------------------------------
// Subscription plan resolution
// ---------------------------------------------------------------------------

export async function getGuildPlan(guildId: string): Promise<PlanTier> {
  const subscription = await prisma.subscription.findFirst({
    where: { guildId, status: { in: ['ACTIVE', 'TRIALING'] } },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    select: { plan: true },
  });
  const plan = subscription?.plan;
  return plan !== undefined && isPlanTier(plan) ? plan : 'FREE';
}

export async function getGuildLimits(guildId: string) {
  return limitsForPlan(await getGuildPlan(guildId));
}
