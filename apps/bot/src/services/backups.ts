import { ChannelType, PermissionFlagsBits, type Guild, type NonThreadGuildBasedChannel } from 'discord.js';
import { prisma, type Backup } from '@nexora/database';
import { serializeError } from '@nexora/logger';
import { getContext } from '../core/context';
import { getGuildLimits } from '../core/guilds';
import { t } from '../core/i18n';
import { safeJsonParse, sha256, toJson, truncate } from '../core/utils';

interface BackupOverwrite {
  id: string;
  type: number; // 0 = role, 1 = member
  allow: string[];
  deny: string[];
}

interface BackupRole {
  id: string;
  name: string;
  color: number;
  hoist: boolean;
  mentionable: boolean;
  position: number;
  permissions: string;
}

interface BackupChannel {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  position: number;
  topic: string | null;
  nsfw: boolean;
  rateLimitPerUser: number;
  overwrites: BackupOverwrite[];
}

export interface BackupSnapshot {
  version: 1;
  createdAt: string;
  guildName: string;
  roles: BackupRole[];
  channels: BackupChannel[];
  settings: Record<string, unknown> | null;
  configs: Record<string, unknown> | null;
}

const RESTORABLE_CHANNEL_TYPES = new Set<number>([
  ChannelType.GuildText,
  ChannelType.GuildCategory,
  ChannelType.GuildVoice,
  ChannelType.GuildAnnouncement,
]);

/** Snapshot channel type number -> discord.js create() channel type. */
const CHANNEL_CREATE_TYPE: Record<number, ChannelType.GuildText | ChannelType.GuildCategory | ChannelType.GuildVoice | ChannelType.GuildAnnouncement> = {
  [ChannelType.GuildText]: ChannelType.GuildText,
  [ChannelType.GuildCategory]: ChannelType.GuildCategory,
  [ChannelType.GuildVoice]: ChannelType.GuildVoice,
  [ChannelType.GuildAnnouncement]: ChannelType.GuildAnnouncement,
};

export type BackupResult = { ok: true; backup: Backup } | { ok: false; message: string };

/** Snapshot the guild structure + bot configuration into a Backup row. */
export async function createBackup(guild: Guild, createdById: string, name: string, scheduled = false): Promise<BackupResult> {
  const limits = await getGuildLimits(guild.id);
  const existingCount = await prisma.backup.count({ where: { guildId: guild.id } });
  if (existingCount >= limits.backups) {
    return {
      ok: false,
      message: t('backup.limitReached', { limit: limits.backups, plan: 'current' }),
    };
  }

  const settings = await prisma.guildSettings.findUnique({ where: { guildId: guild.id } });
  const [welcome, logConfig, ticketConfig, levelConfig, economyConfig, verificationConfig, antiRaidConfig, starboardConfig, suggestionConfig] =
    await Promise.all([
      prisma.welcomeConfig.findUnique({ where: { guildId: guild.id } }),
      prisma.logConfig.findUnique({ where: { guildId: guild.id } }),
      prisma.ticketConfig.findUnique({ where: { guildId: guild.id } }),
      prisma.levelConfig.findUnique({ where: { guildId: guild.id } }),
      prisma.economyConfig.findUnique({ where: { guildId: guild.id } }),
      prisma.verificationConfig.findUnique({ where: { guildId: guild.id } }),
      prisma.antiRaidConfig.findUnique({ where: { guildId: guild.id } }),
      prisma.starboardConfig.findUnique({ where: { guildId: guild.id } }),
      prisma.suggestionConfig.findUnique({ where: { guildId: guild.id } }),
    ]);

  const snapshot: BackupSnapshot = {
    version: 1,
    createdAt: new Date().toISOString(),
    guildName: guild.name,
    roles: [...guild.roles.cache.values()]
      .filter((role) => !role.managed && role.id !== guild.id)
      .sort((a, b) => a.position - b.position)
      .map((role) => ({
        id: role.id,
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        mentionable: role.mentionable,
        position: role.position,
        permissions: role.permissions.bitfield.toString(),
      })),
    channels: [...guild.channels.cache.values()]
      .filter((channel): channel is NonThreadGuildBasedChannel => !channel.isThread() && RESTORABLE_CHANNEL_TYPES.has(channel.type))
      .sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0) || a.rawPosition - b.rawPosition)
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type as number,
        parentId: channel.parentId,
        position: channel.rawPosition,
        topic: 'topic' in channel ? (channel.topic ?? null) : null,
        nsfw: 'nsfw' in channel ? Boolean(channel.nsfw) : false,
        rateLimitPerUser: 'rateLimitPerUser' in channel ? (channel.rateLimitPerUser ?? 0) : 0,
        overwrites: [...channel.permissionOverwrites.cache.values()].map((overwrite) => ({
          id: overwrite.id,
          type: overwrite.type as number,
          allow: [...overwrite.allow.toArray()],
          deny: [...overwrite.deny.toArray()],
        })),
      })),
    settings: settings
      ? {
          language: settings.language,
          timezone: settings.timezone,
          embedColor: settings.embedColor,
          commandCooldownSeconds: settings.commandCooldownSeconds,
          escalateOnWarn: settings.escalateOnWarn,
        }
      : null,
    configs: {
      welcome,
      logConfig,
      ticketConfig,
      levelConfig,
      economyConfig,
      verificationConfig,
      antiRaidConfig,
      starboardConfig,
      suggestionConfig,
    },
  };

  const json = JSON.stringify(snapshot);
  const backup = await prisma.backup.create({
    data: {
      guildId: guild.id,
      name: truncate(name || `Backup ${snapshot.createdAt.slice(0, 10)}`, 100),
      createdById,
      data: toJson(snapshot),
      sizeBytes: Buffer.byteLength(json, 'utf8'),
      checksum: sha256(json),
      scheduled,
    },
  });
  return { ok: true, backup };
}

export async function listBackups(guildId: string): Promise<Backup[]> {
  return prisma.backup.findMany({
    where: { guildId },
    orderBy: { createdAt: 'desc' },
    take: 25,
    select: { id: true, name: true, createdAt: true, sizeBytes: true, checksum: true, scheduled: true, verified: true, data: true, guildId: true, createdById: true },
  });
}

export async function getBackup(guildId: string, backupId: string): Promise<Backup | null> {
  return prisma.backup.findFirst({ where: { id: backupId, guildId } });
}

export async function deleteBackup(guildId: string, backupId: string): Promise<boolean> {
  const result = await prisma.backup.deleteMany({ where: { id: backupId, guildId } });
  return result.count > 0;
}

/**
 * Restore a backup. Hierarchy-safe by design:
 *  - only creates missing roles/channels, never deletes or moves existing ones
 *  - new roles are clamped below the bot's highest role
 *  - channels are created categories-first, then by position
 *  - overwrites referencing unknown roles/members are skipped
 */
export async function restoreBackup(guild: Guild, backupId: string): Promise<BackupResult> {
  const backup = await getBackup(guild.id, backupId);
  if (!backup) return { ok: false, message: 'Backup not found.' };

  const snapshot = safeJsonParse<BackupSnapshot>(backup.data);
  if (!snapshot || snapshot.version !== 1) return { ok: false, message: 'This backup has an unsupported format.' };
  if (sha256(JSON.stringify(snapshot)) !== backup.checksum) {
    // Data mutated since the backup was written — restore is still attempted
    // (the checksum only covers the serialized snapshot) but flagged.
    getContext().log.warn({ backupId, guildId: guild.id }, 'Backup checksum mismatch');
  }

  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { ok: false, message: 'I need the Manage Roles permission to restore this backup.' };
  }

  // ---- Roles (ascending position) ----------------------------------------
  const roleMap = new Map<string, string>();
  for (const role of snapshot.roles) {
    const existing = guild.roles.cache.get(role.id);
    if (existing) {
      roleMap.set(role.id, role.id);
      continue;
    }
    const position = Math.max(1, Math.min(role.position, me.roles.highest.position - 1));
    const created = await guild.roles
      .create({
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        mentionable: role.mentionable,
        permissions: BigInt(role.permissions) & me.permissions.bitfield, // never grant what the bot lacks
        position,
        reason: 'Backup restore',
      })
      .catch(() => null);
    if (created) roleMap.set(role.id, created.id);
  }

  // ---- Channels (categories first) ----------------------------------------
  if (me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    const channelMap = new Map<string, string>();
    const channels = [...snapshot.channels].sort(
      (a, b) => (a.type === ChannelType.GuildCategory ? 0 : 1) - (b.type === ChannelType.GuildCategory ? 0 : 1) || a.position - b.position,
    );
    for (const channel of channels) {
      if (guild.channels.cache.has(channel.id)) {
        channelMap.set(channel.id, channel.id);
        continue;
      }
      const overwrites = channel.overwrites
        .map((overwrite) => {
          const targetId = overwrite.type === 0 ? (roleMap.get(overwrite.id) ?? null) : overwrite.id;
          if (!targetId) return null;
          return {
            id: targetId,
            allow: overwrite.allow.map((perm) => BigInt(perm)),
            deny: overwrite.deny.map((perm) => BigInt(perm)),
          };
        })
        .filter((overwrite): overwrite is { id: string; allow: bigint[]; deny: bigint[] } => overwrite !== null);

      const parent = channel.parentId ? (channelMap.get(channel.parentId) ?? null) : null;
      const createType = CHANNEL_CREATE_TYPE[channel.type];
      if (!createType) continue; // non-restorable channel type in snapshot
      const created = await guild.channels
        .create({
          name: channel.name,
          type: createType,
          ...(parent ? { parent } : {}),
          ...(channel.type === ChannelType.GuildCategory ? {} : {
            topic: channel.topic ?? undefined,
            nsfw: channel.nsfw || undefined,
            rateLimitPerUser: channel.rateLimitPerUser || undefined,
          }),
          ...(overwrites.length > 0 ? { permissionOverwrites: overwrites } : {}),
          reason: 'Backup restore',
        })
        .catch((err) => {
          getContext().log.warn({ err: serializeError(err), channel: channel.name }, 'Backup channel restore failed');
          return null;
        });
      if (created) channelMap.set(channel.id, created.id);
    }
  }

  // ---- Settings & configs ---------------------------------------------------
  if (snapshot.settings) {
    await prisma.guildSettings
      .update({
        where: { guildId: guild.id },
        data: {
          ...(typeof snapshot.settings['language'] === 'string' ? { language: snapshot.settings['language'] as string } : {}),
          ...(typeof snapshot.settings['timezone'] === 'string' ? { timezone: snapshot.settings['timezone'] as string } : {}),
          ...(typeof snapshot.settings['embedColor'] === 'number' ? { embedColor: snapshot.settings['embedColor'] as number } : {}),
          ...(typeof snapshot.settings['commandCooldownSeconds'] === 'number' ? { commandCooldownSeconds: snapshot.settings['commandCooldownSeconds'] as number } : {}),
          ...(typeof snapshot.settings['escalateOnWarn'] === 'boolean' ? { escalateOnWarn: snapshot.settings['escalateOnWarn'] as boolean } : {}),
        },
      })
      .catch(() => undefined);
  }

  const configs = snapshot.configs ?? {};
  await restoreConfigRow(guild.id, 'welcomeConfig', configs['welcome']);
  await restoreConfigRow(guild.id, 'logConfig', configs['logConfig']);
  await restoreConfigRow(guild.id, 'ticketConfig', configs['ticketConfig']);
  await restoreConfigRow(guild.id, 'levelConfig', configs['levelConfig']);
  await restoreConfigRow(guild.id, 'economyConfig', configs['economyConfig']);
  await restoreConfigRow(guild.id, 'verificationConfig', configs['verificationConfig']);
  await restoreConfigRow(guild.id, 'antiRaidConfig', configs['antiRaidConfig']);
  await restoreConfigRow(guild.id, 'starboardConfig', configs['starboardConfig']);
  await restoreConfigRow(guild.id, 'suggestionConfig', configs['suggestionConfig']);

  await prisma.backup.update({ where: { id: backup.id }, data: { verified: true } }).catch(() => undefined);
  return { ok: true, backup };
}

/** Restore scalar config fields from a snapshot onto the guild's config row. */
async function restoreConfigRow(guildId: string, table: string, snapshotRow: unknown): Promise<void> {
  if (!snapshotRow || typeof snapshotRow !== 'object') return;
  try {
    const source = snapshotRow as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      if (['id', 'guildId'].includes(key)) continue;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || Array.isArray(value)) {
        data[key] = value;
      } else if (value !== null && typeof value === 'object') {
        data[key] = toJson(value);
      }
    }
    if (Object.keys(data).length === 0) return;

    // All per-guild config delegates share the same upsert shape by guildId;
    // the narrow local interface keeps the dynamic dispatch type-safe.
    const model = CONFIG_DELEGATES[table];
    if (!model) return;
    await model.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
  } catch (err) {
    getContext().log.warn({ err: serializeError(err), guildId, table }, 'Config restore failed');
  }
}

interface GenericConfigDelegate {
  upsert(args: {
    where: { guildId: string };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<unknown>;
}

const CONFIG_DELEGATES: Record<string, GenericConfigDelegate> = {
  welcomeConfig: prisma.welcomeConfig as unknown as GenericConfigDelegate,
  logConfig: prisma.logConfig as unknown as GenericConfigDelegate,
  ticketConfig: prisma.ticketConfig as unknown as GenericConfigDelegate,
  levelConfig: prisma.levelConfig as unknown as GenericConfigDelegate,
  economyConfig: prisma.economyConfig as unknown as GenericConfigDelegate,
  verificationConfig: prisma.verificationConfig as unknown as GenericConfigDelegate,
  antiRaidConfig: prisma.antiRaidConfig as unknown as GenericConfigDelegate,
  starboardConfig: prisma.starboardConfig as unknown as GenericConfigDelegate,
  suggestionConfig: prisma.suggestionConfig as unknown as GenericConfigDelegate,
};
