import { ChannelType, PermissionFlagsBits, type Guild, type GuildMember } from 'discord.js';
import { prisma, type AntiRaidConfig } from '@nexora/database';
import type { AutoModActionType } from '@nexora/types';
import { errorEmbed, snowflakeToDate, warnEmbed } from '@nexora/discord';
import { serializeError } from '@nexora/logger';
import { getContext } from '../core/context';
import { getGuildSettings } from '../core/guilds';
import { toJson } from '../core/utils';
import { kickMember, banMember } from './moderation';
import { logEvent } from './logging';

const RAID_WINDOW_PREFIX = 'antiraid:joins';

export async function getAntiRaidConfig(guildId: string): Promise<AntiRaidConfig> {
  return prisma.antiRaidConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
}

async function alertChannel(guild: Guild, config: AntiRaidConfig): Promise<void> {
  const settings = await getGuildSettings(guild.id).catch(() => null);
  const channelId = config.alertChannelId ?? settings?.modLogChannelId;
  if (!channelId) return;
  const channel = await getContext().client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isSendable()) return;
  const me = guild.members.me;
  await channel
    .send({
      content: me ? `${me.toString()} ` : '',
      embeds: [
        errorEmbed(
          `Possible raid detected: **${config.joinThreshold}+ joins in ${config.windowSeconds}s**.\n` +
            `Lockdown is **${config.lockdownActive ? 'ACTIVE' : 'inactive'}**. ` +
            `Quarantine role: ${config.quarantineRoleId ? `<@&${config.quarantineRoleId}>` : 'not configured'}.`,
        ).setTitle('Anti-raid alert'),
      ],
    })
    .catch(() => undefined);
}

/**
 * Deny SendMessages for @everyone in every text channel. Returns the list of
 * channels that were locked (used for auto-recovery).
 */
export async function setLockdown(guild: Guild, active: boolean, reason: string): Promise<number> {
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) return 0;
  const channels = [...guild.channels.cache.values()].filter(
    (channel) => channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement,
  );
  let changed = 0;
  for (const channel of channels) {
    const everyone = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
    if (active && everyone?.deny.has(PermissionFlagsBits.SendMessages)) continue;
    const result = await channel.permissionOverwrites
      .edit(guild.roles.everyone, { SendMessages: active ? false : null }, { reason })
      .then(() => true)
      .catch(() => false);
    if (result) changed += 1;
  }
  await prisma.antiRaidConfig
    .update({ where: { guildId: guild.id }, data: { lockdownActive: active } })
    .catch(() => undefined);
  return changed;
}

async function applyQuarantine(guild: Guild, member: GuildMember, config: AntiRaidConfig): Promise<void> {
  if (!config.quarantineEnabled || !config.quarantineRoleId) return;
  const role = guild.roles.cache.get(config.quarantineRoleId);
  const me = guild.members.me;
  if (!role || !me?.permissions.has(PermissionFlagsBits.ManageRoles)) return;
  if (role.position >= me.roles.highest.position) return;
  await member.roles.add(role, 'Anti-raid quarantine').catch(() => undefined);
}

/**
 * Join-rate raid detection. Called from guildMemberAdd:
 *  - counts joins in the configured window (cache incrTtl)
 *  - individually screens brand-new accounts
 *  - on threshold breach executes the configured action (quarantine /
 *    lockdown / alerts) and updates lastRaidAt / lockdownActive
 *  - auto-recovers the lockdown once the join rate cools down
 */
export async function handleMemberJoin(member: GuildMember): Promise<void> {
  const guild = member.guild;
  const config = await getAntiRaidConfig(guild.id);
  if (!config.enabled) return;

  const { cache, log } = getContext();

  // ---- Individual account age screening --------------------------------
  const accountAgeHours = (Date.now() - snowflakeToDate(member.id).getTime()) / 3_600_000;
  const minAge = config.minAccountAgeHours;
  if (minAge > 0 && accountAgeHours < minAge) {
    if (config.action === 'KICK' || config.action === 'BAN') {
      const outcome =
        config.action === 'KICK'
          ? await kickMember({ guild, targetId: member.id, reason: 'Anti-raid: account too new', moderator: null })
          : await banMember({ guild, targetId: member.id, reason: 'Anti-raid: account too new', moderator: null });
      if (!outcome.ok) await applyQuarantine(guild, member, config);
    } else {
      await applyQuarantine(guild, member, config);
    }
    await logEvent(guild, 'automod', {
      action: `New account quarantined (${Math.floor(accountAgeHours)}h < ${minAge}h minimum)`,
      targetId: member.id,
      metadata: { accountAgeHours: Math.floor(accountAgeHours), minAgeHours: minAge },
      title: 'Anti-raid: new account',
    }).catch(() => undefined);
  }

  // ---- Join-rate tracking -------------------------------------------------
  const joinCount = await cache.incrTtl(`${RAID_WINDOW_PREFIX}:${guild.id}`, config.windowSeconds);
  const raidMode = joinCount >= config.joinThreshold;

  if (raidMode && !config.lockdownActive) {
    log.warn({ guildId: guild.id, joinCount }, 'Anti-raid threshold breached');
    await prisma.antiRaidConfig
      .update({ where: { guildId: guild.id }, data: { lastRaidAt: new Date() } })
      .catch(() => undefined);
    if (config.autoLockdown) {
      const locked = await setLockdown(guild, true, 'Anti-raid automatic lockdown');
      log.warn({ guildId: guild.id, locked }, 'Anti-raid lockdown engaged');
    }
    await alertChannel(guild, config);
    await logEvent(guild, 'automod', {
      action: `Raid threshold breached (${joinCount} joins / ${config.windowSeconds}s)`,
      metadata: { joinCount, lockdown: config.autoLockdown },
      title: 'Raid detected',
    }).catch(() => undefined);
    await prisma.auditLog
      .create({
        data: {
          actorType: 'BOT',
          actorId: getContext().client.user?.id,
          guildId: guild.id,
          action: 'antiraid.triggered',
          targetType: 'GUILD',
          targetId: guild.id,
          metadata: toJson({ joinCount, windowSeconds: config.windowSeconds }),
        },
      })
      .catch(() => undefined);
  }

  if (raidMode) {
    // Members joining during a raid get quarantined immediately.
    await applyQuarantine(guild, member, config).catch((err) =>
      log.warn({ err: serializeError(err) }, 'Quarantine failed'),
    );
  } else if (config.lockdownActive && config.autoRecover) {
    // Auto-recover: rate cooled to half the threshold → lift the lockdown.
    if (joinCount <= Math.max(1, Math.floor(config.joinThreshold / 2))) {
      const unlocked = await setLockdown(guild, false, 'Anti-raid auto-recovery');
      if (unlocked > 0) {
        log.info({ guildId: guild.id, unlocked }, 'Anti-raid lockdown lifted');
        await alertRecovery(guild, unlocked);
      }
    }
  }
}

async function alertRecovery(guild: Guild, channels: number): Promise<void> {
  const settings = await getGuildSettings(guild.id).catch(() => null);
  const channelId = settings?.modLogChannelId;
  if (!channelId) return;
  const channel = await getContext().client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isSendable()) return;
  await channel
    .send({
      embeds: [
        warnEmbed(`Join rate normalized — lockdown lifted on ${channels} channels.`).setTitle('Anti-raid recovery'),
      ],
    })
    .catch(() => undefined);
}
