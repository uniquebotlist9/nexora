import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma, type Guild } from '@nexora/database';
import type { DashboardGuildAccess, PlanTier, PlanLimits } from '@nexora/types';
import { limitsForPlan, isPlanTier } from '@nexora/types';
import { getEnv } from '@nexora/config';
import { dashboardAccessLevel } from '@nexora/permissions';
import type { ActionResult } from '@/lib/result';

export type GuildAccessLevel = 'manager' | 'admin';

export interface GuildContext {
  ok: true;
  guild: Guild;
  access: DashboardGuildAccess;
  level: GuildAccessLevel;
  guilds: DashboardGuildAccess[];
  plan: PlanTier;
  limits: PlanLimits;
}

export type GuildContextFailure =
  | { ok: false; reason: 'unauthenticated' }
  | { ok: false; reason: 'forbidden' }
  | { ok: false; reason: 'notfound' };

export async function getSession(): Promise<Session | null> {
  return getServerSession(authOptions);
}

/** Resolve the active subscription plan for a guild (FREE when none). */
export async function getGuildPlan(guildId: string): Promise<PlanTier> {
  const sub = await prisma.subscription.findFirst({
    where: { guildId, status: { in: ['ACTIVE', 'TRIALING'] } },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    select: { plan: true },
  });
  // plan is a plain string column — guard it into the PlanTier union.
  return sub?.plan != null && isPlanTier(sub.plan) ? sub.plan : 'FREE';
}

/**
 * Resolve the full guild context for a dashboard page: authenticated session,
 * guild-level access check (viewer is not enough — manager or admin required)
 * and the guild's plan limits. Call this in every server component / action.
 */
export async function getGuildContext(guildId: string): Promise<GuildContext | GuildContextFailure> {
  const session = await getSession();
  if (!session?.user?.id) return { ok: false, reason: 'unauthenticated' };

  const guilds = session.guilds ?? [];
  const access = guilds.find((g) => g.guildId === guildId);
  if (!access || dashboardAccessLevel(access.permissions) === 'none') {
    return { ok: false, reason: 'forbidden' };
  }

  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guild) return { ok: false, reason: 'notfound' };

  const plan = await getGuildPlan(guildId);
  return {
    ok: true,
    guild,
    access,
    level: access.isAdmin ? 'admin' : 'manager',
    guilds,
    plan,
    limits: limitsForPlan(plan),
  };
}

/**
 * Guard for server actions: verifies the caller has manager/admin access to
 * the guild. Returns an error ActionResult that the action should return as-is.
 */
export async function assertGuildAccess(guildId: string): Promise<ActionResult<never> | null> {
  const ctx = await getGuildContext(guildId);
  if (ctx.ok) return null;
  switch (ctx.reason) {
    case 'unauthenticated':
      return { ok: false, error: 'You need to sign in to do that.' };
    case 'forbidden':
      return { ok: false, error: 'You need Manage Server permissions on this server.' };
    case 'notfound':
      return { ok: false, error: 'Server not found — is Nexora still in it?' };
  }
}

/** Fetch live bot/API health with a graceful offline fallback. */
export interface BotStatus {
  online: boolean;
  detail: 'ok' | 'degraded' | 'down' | 'offline';
}

export async function fetchBotStatus(): Promise<BotStatus> {
  const base = getEnv().API_URL;
  if (!base) return { online: false, detail: 'offline' };
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { online: false, detail: 'down' };
    const body = (await res.json()) as { status?: string };
    if (body.status === 'ok') return { online: true, detail: 'ok' };
    if (body.status === 'degraded') return { online: true, detail: 'degraded' };
    return { online: false, detail: 'down' };
  } catch {
    return { online: false, detail: 'offline' };
  }
}
