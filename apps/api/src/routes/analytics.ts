import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import { limitsForPlan } from '@nexora/types';
import type { RequestHandler } from 'express';
import { asyncH } from '../lib/async';
import { getApiKey, requireScope, SCOPES } from '../auth/api-key';
import { requireGuild } from '../lib/guild-access';
import { resolveGuildPlan } from '../lib/plan';
import { parse } from '../lib/http';

const ALLOWED_DAYS = [7, 30, 90, 365] as const;
type AnalyticsDays = (typeof ALLOWED_DAYS)[number];

const analyticsQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((v): v is AnalyticsDays => (ALLOWED_DAYS as readonly number[]).includes(v), {
      message: 'days must be one of 7, 30, 90, 365',
    })
    .default(7),
});

interface DailyPoint {
  date: string;
  members: number;
  joins: number;
  leaves: number;
  messages: number;
  activeUsers: number;
  voiceMinutes: number;
  commandsUsed: number;
  modActions: number;
  ticketsOpened: number;
}

/**
 * GET /v1/guilds/:guildId/analytics?days=7|30|90|365
 *
 * Returns the AnalyticsDaily series plus summed totals. Plan-based retention is
 * enforced: `days` is clamped to `limitsForPlan(plan).analyticsRetentionDays`
 * and the response reports the effective window (`truncated: true` when
 * clamping happened).
 */
const analyticsRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  const { days: requestedDays } = parse(analyticsQuerySchema, req.query, 'query');

  const plan = await resolveGuildPlan(guild.id, key.userId);
  const retentionDays = limitsForPlan(plan).analyticsRetentionDays;
  const effectiveDays = Math.min(requestedDays, retentionDays);
  const truncated = requestedDays > retentionDays;

  const today = new Date();
  const endOfDay = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999),
  );
  const startOfDay = new Date(endOfDay.getTime() - (effectiveDays - 1) * 86_400_000);

  const rows = await prisma.analyticsDaily.findMany({
    where: { guildId: guild.id, date: { gte: startOfDay, lte: endOfDay } },
    orderBy: { date: 'asc' },
  });

  const series: DailyPoint[] = rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    members: r.members,
    joins: r.joins,
    leaves: r.leaves,
    messages: r.messages,
    activeUsers: r.activeUsers,
    voiceMinutes: r.voiceMinutes,
    commandsUsed: r.commandsUsed,
    modActions: r.modActions,
    ticketsOpened: r.ticketsOpened,
  }));

  // `members` is a daily gauge, so the latest point is the current value;
  // everything else is a daily counter that is summed over the window.
  let members: number | null = null;
  const totals = {
    joins: 0,
    leaves: 0,
    messages: 0,
    activeUsers: 0,
    voiceMinutes: 0,
    commandsUsed: 0,
    modActions: 0,
    ticketsOpened: 0,
  };
  for (const point of series) {
    members = point.members;
    totals.joins += point.joins;
    totals.leaves += point.leaves;
    totals.messages += point.messages;
    totals.activeUsers += point.activeUsers;
    totals.voiceMinutes += point.voiceMinutes;
    totals.commandsUsed += point.commandsUsed;
    totals.modActions += point.modActions;
    totals.ticketsOpened += point.ticketsOpened;
  }

  res.json({
    guildId: guild.id,
    plan,
    requestedDays,
    effectiveDays,
    retentionDays,
    truncated,
    series,
    totals: { ...totals, members },
  });
});

const topCommandsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * GET /v1/guilds/:guildId/analytics/top-commands?limit=10
 *
 * Most-used commands in the guild (CommandStat tracks lifetime uses per
 * command). Registered BEFORE the '/' catch-all route.
 */
const topCommandsRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const { limit } = parse(topCommandsQuerySchema, req.query, 'query');

  const top = await prisma.commandStat.findMany({
    where: { guildId: guild.id },
    orderBy: [{ uses: 'desc' }, { commandName: 'asc' }],
    take: limit,
    select: { commandName: true, uses: true, lastUsedAt: true },
  });

  res.json({
    guildId: guild.id,
    items: top.map((row) => ({
      commandName: row.commandName,
      uses: row.uses,
      lastUsedAt: row.lastUsedAt,
    })),
  });
});

export function analyticsRouter(): Router {
  const router = Router();
  router.get('/top-commands', requireScope(SCOPES.ANALYTICS_READ), topCommandsRoute);
  router.get('/', requireScope(SCOPES.ANALYTICS_READ), analyticsRoute);
  return router;
}
