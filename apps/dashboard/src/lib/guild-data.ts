import 'server-only';
import { prisma } from '@nexora/database';
import type { GuildOption } from '@/components/shared/guild-selects';

/** Server-side helpers for loading guild roles/channels as option lists. */

export async function loadRoles(guildId: string): Promise<GuildOption[]> {
  const roles = await prisma.role.findMany({
    where: { guildId },
    orderBy: { position: 'desc' },
    select: { id: true, name: true },
  });
  return roles.map((r) => ({ id: r.id, name: r.name }));
}

export async function loadChannels(guildId: string): Promise<GuildOption[]> {
  const channels = await prisma.channel.findMany({
    where: { guildId },
    orderBy: { position: 'asc' },
    select: { id: true, name: true, type: true },
  });
  // Prefix non-text channels so selectors can display/filter them.
  // The bot stores String(channel.type) — numeric ChannelType values.
  const prefixes: Record<string, string> = {
    '2': '[voice] ',
    '4': '[category] ',
    '5': '[announcement] ',
    '13': '[stage] ',
    '15': '[forum] ',
  };
  return channels.map((c) => ({ id: c.id, name: `${prefixes[c.type] ?? ''}${c.name}` }));
}

/** Safely parse a Prisma Json column into a typed value with a fallback. */
export function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}
