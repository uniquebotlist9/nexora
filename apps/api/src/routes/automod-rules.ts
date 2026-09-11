import { Router } from 'express';
import { z } from 'zod';
import { prisma, type Prisma } from '@nexora/database';
import { autoModRuleInputSchema } from '@nexora/validation';
import type { RequestHandler } from 'express';
import { asyncH } from '../lib/async';
import { getApiKey, requireScope, SCOPES } from '../auth/api-key';
import { requireGuild } from '../lib/guild-access';
import { resolveGuildLimits } from '../lib/plan';
import { auditApiCall } from '../lib/audit';
import { parse, paginated, parsePagination, offset } from '../lib/http';
import { AppError, ERROR_CODES } from '../lib/errors';

// NOTE (mongodb connector): rule type is a plain String column; valid values
// are enforced by autoModRuleInputSchema (zod), not a Prisma enum.

const idParamSchema = z.object({ id: z.string().min(10).max(64) });

function parseEnabledFilter(query: unknown): boolean | undefined {
  const raw = (query as Record<string, unknown>).enabled;
  if (raw === undefined) return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new AppError(ERROR_CODES.VALIDATION_ERROR, "Invalid query parameter 'enabled': expected 'true' or 'false'", 400);
}

function toRuleData(input: z.infer<typeof autoModRuleInputSchema>): Omit<Prisma.AutoModRuleUncheckedCreateInput, 'guildId'> {
  return {
    name: input.name,
    type: input.type,
    enabled: input.enabled,
    trigger: input.trigger as Prisma.InputJsonValue,
    actions: input.actions as Prisma.InputJsonValue,
    exemptRoleIds: input.exemptRoleIds,
    exemptChannelIds: input.exemptChannelIds,
  };
}

/** GET /v1/guilds/:guildId/automod-rules */
const listRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const { page, pageSize } = parsePagination(req.query);
  const enabled = parseEnabledFilter(req.query);

  const where: Prisma.AutoModRuleWhereInput = { guildId: guild.id };
  if (enabled !== undefined) where.enabled = enabled;

  const [total, items] = await Promise.all([
    prisma.autoModRule.count({ where }),
    prisma.autoModRule.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset({ page, pageSize }),
      take: pageSize,
    }),
  ]);
  res.json(paginated(items, total, page, pageSize));
});

/** POST /v1/guilds/:guildId/automod-rules — plan limit enforced. */
const createRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  const input = parse(autoModRuleInputSchema, req.body, 'body');

  const { plan, limits } = await resolveGuildLimits(guild.id, key.userId);
  const existing = await prisma.autoModRule.count({ where: { guildId: guild.id } });
  if (existing >= limits.autoModRules) {
    throw new AppError(
      ERROR_CODES.PLAN_LIMIT_EXCEEDED,
      `The ${plan} plan allows at most ${limits.autoModRules} AutoMod rules per guild`,
      403,
      { plan, limit: limits.autoModRules, current: existing },
    );
  }

  const rule = await prisma.autoModRule.create({ data: { guildId: guild.id, ...toRuleData(input) } });

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.automodRule.create',
    targetType: 'AutoModRule',
    targetId: rule.id,
    metadata: { name: rule.name, type: rule.type },
  });

  res.status(201).json({ rule });
});

/** GET /v1/guilds/:guildId/automod-rules/:id */
const getRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const { id } = parse(idParamSchema, req.params, 'params');
  const rule = await prisma.autoModRule.findFirst({ where: { id, guildId: guild.id } });
  if (!rule) throw new AppError(ERROR_CODES.NOT_FOUND, 'AutoMod rule not found', 404);
  res.json({ rule });
});

/** PATCH /v1/guilds/:guildId/automod-rules/:id */
const updateRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  const { id } = parse(idParamSchema, req.params, 'params');
  const input = parse(autoModRuleInputSchema.partial(), req.body, 'body');

  const existing = await prisma.autoModRule.findFirst({ where: { id, guildId: guild.id } });
  if (!existing) throw new AppError(ERROR_CODES.NOT_FOUND, 'AutoMod rule not found', 404);

  const data: Prisma.AutoModRuleUncheckedUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.type !== undefined) data.type = input.type;
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.trigger !== undefined) data.trigger = input.trigger as Prisma.InputJsonValue;
  if (input.actions !== undefined) data.actions = input.actions as Prisma.InputJsonValue;
  if (input.exemptRoleIds !== undefined) data.exemptRoleIds = input.exemptRoleIds;
  if (input.exemptChannelIds !== undefined) data.exemptChannelIds = input.exemptChannelIds;

  const rule = await prisma.autoModRule.update({ where: { id }, data });

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.automodRule.update',
    targetType: 'AutoModRule',
    targetId: id,
    metadata: { changed: Object.keys(data) },
  });

  res.json({ rule });
});

/** DELETE /v1/guilds/:guildId/automod-rules/:id */
const deleteRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  const { id } = parse(idParamSchema, req.params, 'params');

  const deleted = await prisma.autoModRule.deleteMany({ where: { id, guildId: guild.id } });
  if (deleted.count === 0) throw new AppError(ERROR_CODES.NOT_FOUND, 'AutoMod rule not found', 404);

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.automodRule.delete',
    targetType: 'AutoModRule',
    targetId: id,
  });

  res.status(204).send();
});

export function autoModRulesRouter(): Router {
  const router = Router();
  router.get('/', requireScope(SCOPES.GUILDS_READ), listRoute);
  router.post('/', requireScope(SCOPES.GUILDS_WRITE), createRoute);
  router.get('/:id', requireScope(SCOPES.GUILDS_READ), getRoute);
  router.patch('/:id', requireScope(SCOPES.GUILDS_WRITE), updateRoute);
  router.delete('/:id', requireScope(SCOPES.GUILDS_WRITE), deleteRoute);
  return router;
}
