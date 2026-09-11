import { prisma } from '@nexora/database';
import { isPlanTier, limitsForPlan, type PlanLimits, type PlanTier } from '@nexora/types';

const ACTIVE_STATUSES = ['ACTIVE', 'TRIALING', 'PAST_DUE'] as const;

/**
 * Resolve the effective plan for a guild. Priority:
 *  1. An active/trialing/past_due guild-level subscription (most recently
 *     updated first — a re-grant updates an existing row instead of creating
 *     a newer one, so createdAt alone would show a stale plan).
 *  2. An active user-level subscription (guildId = null) held by `userId`
 *     (the API key owner) — user-level premium covers their guilds.
 *  3. FREE.
 */
export async function resolveGuildPlan(guildId: string, userId?: string): Promise<PlanTier> {
  const guildSub = await prisma.subscription.findFirst({
    where: { guildId, status: { in: [...ACTIVE_STATUSES] } },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    select: { plan: true },
  });
  if (guildSub) return toPlanTier(guildSub.plan);

  if (userId) {
    const userSub = await prisma.subscription.findFirst({
      where: { guildId: null, userId, status: { in: [...ACTIVE_STATUSES] } },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: { plan: true },
    });
    if (userSub) return toPlanTier(userSub.plan);
  }

  return 'FREE';
}

/** Resolve plan limits for a guild (see resolveGuildPlan for tier resolution). */
export async function resolveGuildLimits(
  guildId: string,
  userId?: string,
): Promise<{ plan: PlanTier; limits: PlanLimits }> {
  const plan = await resolveGuildPlan(guildId, userId);
  return { plan, limits: limitsForPlan(plan) };
}

/** Resolve the plan of a user-level subscription (guildId = null), for endpoints that are not guild-scoped (e.g. API key creation). */
export async function resolveUserPlan(userId: string): Promise<PlanTier> {
  const userSub = await prisma.subscription.findFirst({
    where: { guildId: null, userId, status: { in: [...ACTIVE_STATUSES] } },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    select: { plan: true },
  });
  return userSub ? toPlanTier(userSub.plan) : 'FREE';
}

/** Resolve plan limits for a user-level subscription owner. */
export async function resolveUserLimits(
  userId: string,
): Promise<{ plan: PlanTier; limits: PlanLimits }> {
  const plan = await resolveUserPlan(userId);
  return { plan, limits: limitsForPlan(plan) };
}

function toPlanTier(value: string): PlanTier {
  return isPlanTier(value) ? value : 'FREE';
}
