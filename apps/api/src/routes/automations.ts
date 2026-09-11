import { Router } from 'express';
import { z } from 'zod';
import { prisma, type Prisma } from '@nexora/database';
import { automationInputSchema } from '@nexora/validation';
import { limitsForPlan } from '@nexora/types';
import type { RequestHandler } from 'express';
import { asyncH } from '../lib/async';
import { getApiKey, requireScope, SCOPES } from '../auth/api-key';
import { requireGuild } from '../lib/guild-access';
import { resolveGuildLimits } from '../lib/plan';
import { auditApiCall } from '../lib/audit';
import { parse, paginated, parsePagination, offset } from '../lib/http';
import { AppError, ERROR_CODES } from '../lib/errors';

const idParamSchema = z.object({ id: z.string().min(10).max(64) });

function toAutomationData(input: z.infer<typeof automationInputSchema>): Omit<Prisma.AutomationUncheckedCreateInput, 'guildId'> {
  return {
    name: input.name,
    enabled: input.enabled,
    trigger: input.trigger.type,
    triggerConfig: input.trigger.config as Prisma.InputJsonValue,
    actions: input.actions as Prisma.InputJsonValue,
  };
}

/** GET /v1/guilds/:guildId/automations */
const listRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const { page, pageSize } = parsePagination(req.query);
  const enabled = parseListFilter(req.query);

  const where: Prisma.AutomationWhereInput = { guildId: guild.id };
  if (enabled !== undefined) where.enabled = enabled;

  const [total, items] = await Promise.all([
    prisma.automation.count({ where }),
    prisma.automation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset({ page, pageSize }),
      take: pageSize,
    }),
  ]);
  res.json(paginated(items, total, page, pageSize));
});

function parseListFilter(query: unknown): boolean | undefined {
  const raw = (query as Record<string, unknown>).enabled;
  if (raw === undefined) return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new AppError(ERROR_CODES.VALIDATION_ERROR, "Invalid query parameter 'enabled': expected 'true' or 'false'", 400);
}

/** POST /v1/guilds/:guildId/automations — plan limit enforced. */
const createRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  const input = parse(automationInputSchema, req.body, 'body');

  const { plan, limits } = await resolveGuildLimits(guild.id, key.userId);
  const existing = await prisma.automation.count({ where: { guildId: guild.id } });
  if (existing >= limits.automations) {
    throw new AppError(
      ERROR_CODES.PLAN_LIMIT_EXCEEDED,
      `The ${plan} plan allows at most ${limits.automations} automations per guild`,
      403,
      { plan, limit: limits.automations, current: existing },
    );
  }

  const automation = await prisma.automation.create({
    data: { guildId: guild.id, ...toAutomationData(input) },
  });

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.automation.create',
    targetType: 'Automation',
    targetId: automation.id,
    metadata: { name: automation.name, trigger: automation.trigger },
  });

  res.status(201).json({ automation });
});

/** GET /v1/guilds/:guildId/automations/:id */
const getRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const { id } = parse(idParamSchema, req.params, 'params');
  const automation = await prisma.automation.findFirst({ where: { id, guildId: guild.id } });
  if (!automation) throw new AppError(ERROR_CODES.NOT_FOUND, 'Automation not found', 404);
  res.json({ automation });
});

/** PATCH /v1/guilds/:guildId/automations/:id */
const updateRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  const { id } = parse(idParamSchema, req.params, 'params');
  const input = parse(automationInputSchema.partial(), req.body, 'body');

  const existing = await prisma.automation.findFirst({ where: { id, guildId: guild.id } });
  if (!existing) throw new AppError(ERROR_CODES.NOT_FOUND, 'Automation not found', 404);

  const data: Prisma.AutomationUncheckedUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.enabled !== undefined) data.enabled = input.enabled;
  if (input.trigger !== undefined) {
    data.trigger = input.trigger.type;
    data.triggerConfig = input.trigger.config as Prisma.InputJsonValue;
  }
  if (input.actions !== undefined) data.actions = input.actions as Prisma.InputJsonValue;

  const automation = await prisma.automation.update({ where: { id }, data });

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.automation.update',
    targetType: 'Automation',
    targetId: id,
    metadata: { changed: Object.keys(data) },
  });

  res.json({ automation });
});

/** DELETE /v1/guilds/:guildId/automations/:id */
const deleteRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  const { id } = parse(idParamSchema, req.params, 'params');

  const deleted = await prisma.automation.deleteMany({ where: { id, guildId: guild.id } });
  if (deleted.count === 0) throw new AppError(ERROR_CODES.NOT_FOUND, 'Automation not found', 404);

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.automation.delete',
    targetType: 'Automation',
    targetId: id,
  });

  res.status(204).send();
});

export function automationsRouter(): Router {
  const router = Router();
  router.get('/', requireScope(SCOPES.GUILDS_READ), listRoute);
  router.post('/', requireScope(SCOPES.GUILDS_WRITE), createRoute);
  router.get('/:id', requireScope(SCOPES.GUILDS_READ), getRoute);
  router.patch('/:id', requireScope(SCOPES.GUILDS_WRITE), updateRoute);
  router.delete('/:id', requireScope(SCOPES.GUILDS_WRITE), deleteRoute);
  return router;
}
