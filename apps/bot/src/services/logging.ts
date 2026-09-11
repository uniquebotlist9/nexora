import { z } from 'zod';
import { prisma, type LogConfig } from '@nexora/database';
import { logCategoryNameSchema } from '@nexora/validation';
import { brandEmbed } from '@nexora/discord';
import type { Guild } from 'discord.js';
import { getContext } from '../core/context';
import { capitalize, safeJsonParse, toJson, truncate } from '../core/utils';

export type LogCategory = z.infer<typeof logCategoryNameSchema>;

const categoryConfigSchema = z.record(
  logCategoryNameSchema,
  z.object({ enabled: z.boolean().default(false), channelId: z.string().optional() }),
);
type CategoryConfigMap = z.infer<typeof categoryConfigSchema>;

export interface LogEventInput {
  action: string;
  actorId?: string | null;
  targetId?: string | null;
  content?: string | null;
  metadata?: Record<string, unknown>;
  /** Channel the event happened in — used for ignored-channel filtering. */
  eventChannelId?: string | null;
  /** Explicit destination override (e.g. GuildSettings.modLogChannelId). */
  overrideChannelId?: string | null;
  /** Optional one-line summary for the embed title. */
  title?: string;
}

const CATEGORY_COLORS: Record<LogCategory, number> = {
  messageDelete: 0xed4245,
  messageEdit: 0xfee75c,
  memberJoin: 0x57f287,
  memberLeave: 0xed4245,
  ban: 0xed4245,
  unban: 0x57f287,
  kick: 0xed4245,
  timeout: 0xfee75c,
  roleChanges: 0x5865f2,
  channelChanges: 0x5865f2,
  serverChanges: 0x5865f2,
  voice: 0xeb459e,
  nickname: 0x5865f2,
  invites: 0x5865f2,
  moderation: 0xed4245,
  tickets: 0x57f287,
  giveaways: 0xfee75c,
  verification: 0x57f287,
  automod: 0xed4245,
};

const configCache = new Map<string, { config: LogConfig; categories: CategoryConfigMap; expiresAt: number }>();
const CONFIG_TTL_MS = 20_000;

export function invalidateLogConfigCache(guildId: string): void {
  configCache.delete(guildId);
}

async function getLogConfig(guildId: string): Promise<{ config: LogConfig; categories: CategoryConfigMap } | null> {
  const cached = configCache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) {
    return { config: cached.config, categories: cached.categories };
  }
  const config = await prisma.logConfig.findUnique({ where: { guildId } });
  if (!config) return null;
  const parsed = categoryConfigSchema.safeParse(safeJsonParse(config.categories) ?? {});
  const categories = parsed.success ? parsed.data : {};
  configCache.set(guildId, { config, categories, expiresAt: Date.now() + CONFIG_TTL_MS });
  return { config, categories };
}

/**
 * Route a loggable event: always persist a LogEvent row while logging is
 * enabled for the guild, and send a rendered embed to the channel configured
 * for the category (honoring ignoredChannelIds).
 */
export async function logEvent(guild: Guild, category: LogCategory, input: LogEventInput): Promise<void> {
  try {
    const loaded = await getLogConfig(guild.id);
    if (!loaded || !loaded.config.enabled) return;
    const { config, categories } = loaded;

    await prisma.logEvent.create({
      data: {
        guildId: guild.id,
        category,
        action: input.action,
        actorId: input.actorId ?? null,
        targetId: input.targetId ?? null,
        content: input.content ? truncate(input.content, 1000) : null,
        metadata: input.metadata ? toJson(input.metadata) : undefined,
      },
    });

    const categoryConfig = categories[category];
    const channelId = input.overrideChannelId ?? categoryConfig?.channelId ?? null;
    if (!categoryConfig?.enabled && !input.overrideChannelId) return;
    if (!channelId) return;
    if (input.eventChannelId && config.ignoredChannelIds.includes(input.eventChannelId)) return;

    const channel = await getContext().client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isSendable()) return;

    const embed = brandEmbed()
      .setColor(CATEGORY_COLORS[category])
      .setTitle(input.title ?? `${capitalize(category)} log`)
      .setTimestamp(new Date());
    if (input.action) embed.addFields({ name: 'Action', value: truncate(input.action, 1000), inline: true });
    if (input.actorId) embed.addFields({ name: 'Actor', value: `<@${input.actorId}>`, inline: true });
    if (input.targetId) embed.addFields({ name: 'Target', value: `<@${input.targetId}>`, inline: true });
    if (input.eventChannelId) embed.addFields({ name: 'Channel', value: `<#${input.eventChannelId}>`, inline: true });
    if (input.content) embed.addFields({ name: 'Content', value: truncate(input.content, 1000) });
    const metaSummary = Object.entries(input.metadata ?? {})
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => `**${key}:** ${truncate(String(value), 200)}`)
      .join('\n');
    if (metaSummary) embed.addFields({ name: 'Details', value: truncate(metaSummary, 1000) });

    await channel.send({ embeds: [embed] }).catch(() => undefined);
  } catch {
    // Logging must never break the feature that triggered it.
  }
}

/** Moderation log: prefers the LogConfig "moderation" channel, falls back to GuildSettings.modLogChannelId. */
export async function logModeration(
  guild: Guild,
  input: LogEventInput & { fallbackChannelId?: string | null },
): Promise<void> {
  const loaded = await getLogConfig(guild.id).catch(() => null);
  const categoryChannel = loaded?.categories.moderation?.channelId ?? null;
  await logEvent(guild, 'moderation', {
    ...input,
    overrideChannelId: categoryChannel ?? input.fallbackChannelId ?? null,
  });
}
