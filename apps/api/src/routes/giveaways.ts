import { Router } from 'express';
import { z } from 'zod';
import { prisma, type Prisma } from '@nexora/database';
import { paginationSchema, giveawayCreateInputSchema } from '@nexora/validation';
import { GIVEAWAY_STATUSES } from '@nexora/types';
import type { RequestHandler } from 'express';
import { asyncH } from '../lib/async';
import { getApiKey, requireScope, SCOPES } from '../auth/api-key';
import { requireGuild } from '../lib/guild-access';
import { resolveGuildLimits } from '../lib/plan';
import { auditApiCall } from '../lib/audit';
import { parse, paginated, offset } from '../lib/http';
import { AppError, ERROR_CODES } from '../lib/errors';

// NOTE (mongodb connector): Giveaway.status is a plain String column; valid
// values come from @nexora/types (GIVEAWAY_STATUSES).

const giveawaysQuerySchema = paginationSchema.extend({
  status: z.enum(GIVEAWAY_STATUSES).optional(),
});

const idParamSchema = z.object({ id: z.string().min(10).max(64) });

/** GET /v1/guilds/:guildId/giveaways — list with status filter. */
const listGiveawaysRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const q = parse(giveawaysQuerySchema, req.query, 'query');

  const where: Prisma.GiveawayWhereInput = { guildId: guild.id };
  if (q.status) where.status = q.status;

  const [total, items] = await Promise.all([
    prisma.giveaway.count({ where }),
    prisma.giveaway.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip: offset(q),
      take: q.pageSize,
      select: {
        id: true,
        messageId: true,
        channelId: true,
        prize: true,
        description: true,
        winnerCount: true,
        status: true,
        requiredRoleId: true,
        startedAt: true,
        endsAt: true,
        endedAt: true,
        winnerIds: true,
        rerollCount: true,
      },
    }),
  ]);

  res.json(paginated(items, total, q.page, q.pageSize));
});

/**
 * POST /v1/guilds/:guildId/giveaways — create a giveaway.
 *
 * The API records the giveaway and enqueues a ScheduledTask (kind
 * GIVEAWAY_END) for the bot to execute at `endsAt`. The bot owns the Discord
 * side (posting the giveaway message, collecting entries, drawing winners) —
 * the API only persists intent and scheduling, so no Discord state is faked.
 * Plan-gated by limitsForPlan().giveaways (active giveaways).
 */
const createGiveawayRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  const input = parse(giveawayCreateInputSchema, req.body, 'body');

  const { plan, limits } = await resolveGuildLimits(guild.id, key.userId);
  const active = await prisma.giveaway.count({
    where: { guildId: guild.id, status: 'RUNNING' },
  });
  if (active >= limits.giveaways) {
    throw new AppError(
      ERROR_CODES.PLAN_LIMIT_EXCEEDED,
      `The ${plan} plan allows at most ${limits.giveaways} concurrent giveaways per guild`,
      403,
      { plan, limit: limits.giveaways, current: active },
    );
  }

  const endsAt = new Date(Date.now() + input.durationMinutes * 60_000);

  const giveaway = await prisma.$transaction(async (tx) => {
    const created = await tx.giveaway.create({
      data: {
        guildId: guild.id,
        channelId: input.channelId,
        prize: input.prize,
        description: input.description ?? null,
        winnerCount: input.winnerCount,
        status: 'RUNNING',
        requiredRoleId: input.requiredRoleId ?? null,
        minAccountAgeDays: input.minAccountAgeDays ?? null,
        minMembershipDays: input.minMembershipDays ?? null,
        minMessages: input.minMessages ?? null,
        bonusRoles: (input.bonusRoles ?? []) as Prisma.InputJsonValue,
        endsAt,
      },
    });

    // Queue the end-of-giveaway task for the bot's task runner.
    await tx.scheduledTask.create({
      data: {
        guildId: guild.id,
        kind: 'GIVEAWAY_END',
        payload: { giveawayId: created.id } as Prisma.InputJsonValue,
        runAt: endsAt,
      },
    });

    return created;
  });

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.giveaway.create',
    targetType: 'Giveaway',
    targetId: giveaway.id,
    metadata: { prize: giveaway.prize, winnerCount: giveaway.winnerCount, endsAt },
  });

  res.status(201).json({ giveaway });
});

/**
 * POST /v1/guilds/:guildId/giveaways/:id/cancel — cancel a running giveaway.
 * Marks it CANCELLED and cancels the pending GIVEAWAY_END task.
 */
const cancelGiveawayRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  const { id } = parse(idParamSchema, req.params, 'params');

  const giveaway = await prisma.giveaway.findFirst({ where: { id, guildId: guild.id } });
  if (!giveaway) throw new AppError(ERROR_CODES.NOT_FOUND, 'Giveaway not found', 404);
  if (giveaway.status !== 'RUNNING') {
    throw new AppError(ERROR_CODES.CONFLICT, `Giveaway is not running (status: ${giveaway.status})`, 409);
  }

  await prisma.$transaction([
    prisma.giveaway.update({
      where: { id },
      data: { status: 'CANCELLED', endedAt: new Date() },
    }),
    prisma.scheduledTask.updateMany({
      where: {
        guildId: guild.id,
        kind: 'GIVEAWAY_END',
        completedAt: null,
        payload: { giveawayId: id } as Prisma.JsonFilter,
      },
      data: { completedAt: new Date(), error: 'Cancelled via API' },
    }),
  ]);

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.giveaway.cancel',
    targetType: 'Giveaway',
    targetId: id,
  });

  res.json({ cancelled: true, giveawayId: id });
});

export function giveawaysRouter(): Router {
  const router = Router();
  router.get('/', requireScope(SCOPES.GUILDS_READ), listGiveawaysRoute);
  router.post('/', requireScope(SCOPES.GUILDS_WRITE), createGiveawayRoute);
  router.post('/:id/cancel', requireScope(SCOPES.GUILDS_WRITE), cancelGiveawayRoute);
  return router;
}
