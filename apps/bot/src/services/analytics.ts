import { prisma, type Prisma } from '@nexora/database';
import type { Cache } from '@nexora/cache';
import { serializeError } from '@nexora/logger';
import { getContext } from '../core/context';
import { utcDay } from '../core/utils';

export type AnalyticsField =
  | 'joins'
  | 'leaves'
  | 'messages'
  | 'activeUsers'
  | 'voiceMinutes'
  | 'commandsUsed'
  | 'modActions'
  | 'ticketsOpened'
  | 'giveaways'
  | 'newXp';

type AnalyticsDelta = Partial<Record<AnalyticsField, number>>;

/**
 * Incrementally upsert the guild's AnalyticsDaily row for today (UTC).
 * Called from hot paths — every increment is a single upsert.
 */
export async function incrementAnalytics(
  guildId: string,
  deltas: AnalyticsDelta,
  membersSnapshot?: number,
): Promise<void> {
  const positive = Object.fromEntries(
    Object.entries(deltas).filter(([, value]) => typeof value === 'number' && value > 0),
  ) as Record<AnalyticsField, number>;
  if (Object.keys(positive).length === 0 && membersSnapshot === undefined) return;

  const date = utcDay();
  const create = { guildId, date, ...positive, ...(membersSnapshot !== undefined ? { members: membersSnapshot } : {}) };
  const update: Record<string, unknown> = {};
  for (const key of Object.keys(positive)) {
    update[key] = { increment: positive[key as AnalyticsField] };
  }
  if (membersSnapshot !== undefined) update.members = membersSnapshot;

  try {
    await prisma.analyticsDaily.upsert({
      where: { guildId_date: { guildId, date } },
      create: create as unknown as Prisma.AnalyticsDailyUncheckedCreateInput,
      update: update as unknown as Prisma.AnalyticsDailyUncheckedUpdateInput,
    });
  } catch (err) {
    getContext().log.debug({ err: serializeError(err), guildId }, 'Failed to update daily analytics');
  }
}

/**
 * Count a user as "active today" — at most once per user per day thanks to a
 * cache key with a 24h TTL.
 */
export async function trackActiveUser(guildId: string, userId: string, cache: Cache): Promise<void> {
  const day = utcDay().toISOString().slice(0, 10);
  const count = await cache.incrTtl(`analytics:active:${guildId}:${day}:${userId}`, 86_400);
  if (count === 1) {
    await incrementAnalytics(guildId, { activeUsers: 1 });
  }
}
