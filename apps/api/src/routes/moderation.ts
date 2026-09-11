/**
 * Moderation read routes (GET only).
 *
 * DESIGN NOTE — why there is no POST /v1/moderation/ban|timeout|warn:
 * Moderation actions (ban, timeout, warn) are executed exclusively by the bot
 * through the Discord gateway. They require gateway context the REST API does
 * not have: the target's Discord member object (for hierarchy and role
 * checks), permission bitfields of the acting moderator, DM delivery to the
 * target, and audit-log entries in Discord itself. The REST API is strictly
 * read/config + webhooks; the dashboard issues mod actions by instructing the
 * bot (dashboard <-> bot is a separate channel), never through this API.
 * A 405 catch-all for POST /v1/moderation/:action makes this explicit to
 * API consumers instead of returning a generic 404.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma, type Prisma } from '@nexora/database';
import { paginationSchema, snowflakeSchema } from '@nexora/validation';
import { CASE_TYPES } from '@nexora/types';
import type { RequestHandler } from 'express';
import { asyncH } from '../lib/async';
import { requireScope, SCOPES } from '../auth/api-key';
import { requireGuild } from '../lib/guild-access';
import { parse, paginated, offset } from '../lib/http';

// NOTE (mongodb connector): Prisma has no enums on MongoDB, so the case type
// values come from @nexora/types (CASE_TYPES) instead of @prisma/client.

const casesQuerySchema = paginationSchema.extend({
  type: z.enum(CASE_TYPES).optional(),
  targetUserId: snowflakeSchema.optional(),
  active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const warningsQuerySchema = paginationSchema.extend({
  userId: snowflakeSchema,
  active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

/** GET /v1/guilds/:guildId/moderation/cases — paginated with filters. */
const listCasesRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const q = parse(casesQuerySchema, req.query, 'query');

  const where: Prisma.ModerationCaseWhereInput = { guildId: guild.id };
  if (q.type) where.type = q.type;
  if (q.targetUserId) where.targetUserId = q.targetUserId;
  if (q.active !== undefined) where.active = q.active;
  if (q.from || q.to) {
    where.createdAt = {
      ...(q.from ? { gte: q.from } : {}),
      ...(q.to ? { lte: q.to } : {}),
    };
  }

  const [total, items] = await Promise.all([
    prisma.moderationCase.count({ where }),
    prisma.moderationCase.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset(q),
      take: q.pageSize,
    }),
  ]);

  res.json(paginated(items, total, q.page, q.pageSize));
});

/** GET /v1/guilds/:guildId/moderation/warnings — warnings for one user. */
const listWarningsRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const q = parse(warningsQuerySchema, req.query, 'query');

  const where: Prisma.WarningWhereInput = { guildId: guild.id, userId: q.userId };
  if (q.active !== undefined) where.active = q.active;

  const [total, items] = await Promise.all([
    prisma.warning.count({ where }),
    prisma.warning.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset(q),
      take: q.pageSize,
      include: { case: { select: { caseNumber: true, type: true, reason: true } } },
    }),
  ]);

  res.json(paginated(items, total, q.page, q.pageSize));
});

export function moderationRouter(): Router {
  const router = Router();
  router.get('/cases', requireScope(SCOPES.GUILDS_READ), listCasesRoute);
  router.get('/warnings', requireScope(SCOPES.GUILDS_READ), listWarningsRoute);
  return router;
}
