import { Router } from 'express';
import { z } from 'zod';
import { prisma, type Prisma } from '@nexora/database';
import { customCommandInputSchema } from '@nexora/validation';
import type { RequestHandler } from 'express';
import { asyncH } from '../lib/async';
import { getApiKey, requireScope, SCOPES } from '../auth/api-key';
import { requireGuild } from '../lib/guild-access';
import { resolveGuildLimits } from '../lib/plan';
import { auditApiCall } from '../lib/audit';
import { parse, paginated, parsePagination, offset } from '../lib/http';
import { AppError, ERROR_CODES } from '../lib/errors';

const idParamSchema = z.object({ id: z.string().min(10).max(64) });

function parseEnabledFilter(query: unknown): boolean | undefined {
  const raw = (query as Record<string, unknown>).enabled;
  if (raw === undefined) return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new AppError(ERROR_CODES.VALIDATION_ERROR, "Invalid query parameter 'enabled': expected 'true' or 'false'", 400);
}

function toCommandData(input: z.infer<typeof customCommandInputSchema>): Omit<Prisma.CustomCommandUncheckedCreateInput, 'guildId'> {
  return {
    name: input.name,
    description: input.description,
    response: input.response as Prisma.InputJsonValue,
    cooldownSeconds: input.cooldownSeconds,
    requiredRoleIds: input.requiredRoleIds,
    requiredPermission: input.requiredPermission ?? null,
    enabled: input.enabled,
  };
}

/** GET /v1/guilds/:guildId/custom-commands */
const listRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const { page, pageSize } = parsePagination(req.query);
  const enabled = parseEnabledFilter(req.query);

  const where: Prisma.CustomCommandWhereInput = { guildId: guild.id };
  if (enabled !== undefined) where.enabled = enabled;

  const [total, items] = await Promise.all([
    prisma.customCommand.count({ where }),
    prisma.customCommand.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset({ page, pageSize }),
      take: pageSize,
    }),
  ]);
  res.json(paginated(items, total, page, pageSize));
});

/** POST /v1/guilds/:guildId/custom-commands — plan limit enforced. */
const createRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  const input = parse(customCommandInputSchema, req.body, 'body');

  const { plan, limits } = await resolveGuildLimits(guild.id, key.userId);
  const existing = await prisma.customCommand.count({ where: { guildId: guild.id } });
  if (existing >= limits.customCommands) {
    throw new AppError(
      ERROR_CODES.PLAN_LIMIT_EXCEEDED,
      `The ${plan} plan allows at most ${limits.customCommands} custom commands per guild`,
      403,
      { plan, limit: limits.customCommands, current: existing },
    );
  }

  const command = await prisma.customCommand.create({
    data: { guildId: guild.id, ...toCommandData(input) },
  });

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.customCommand.create',
    targetType: 'CustomCommand',
    targetId: command.id,
    metadata: { name: command.name },
  });

  res.status(201).json({ command });
});

/** GET /v1/guilds/:guildId/custom-commands/:id */
const getRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const { id } = parse(idParamSchema, req.params, 'params');
  const command = await prisma.customCommand.findFirst({ where: { id, guildId: guild.id } });
  if (!command) throw new AppError(ERROR_CODES.NOT_FOUND, 'Custom command not found', 404);
  res.json({ command });
});

/** PATCH /v1/guilds/:guildId/custom-commands/:id */
const updateRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  const { id } = parse(idParamSchema, req.params, 'params');
  const input = parse(customCommandInputSchema.partial(), req.body, 'body');

  const existing = await prisma.customCommand.findFirst({ where: { id, guildId: guild.id } });
  if (!existing) throw new AppError(ERROR_CODES.NOT_FOUND, 'Custom command not found', 404);

  const data: Prisma.CustomCommandUncheckedUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.response !== undefined) data.response = input.response as Prisma.InputJsonValue;
  if (input.cooldownSeconds !== undefined) data.cooldownSeconds = input.cooldownSeconds;
  if (input.requiredRoleIds !== undefined) data.requiredRoleIds = input.requiredRoleIds;
  if (input.requiredPermission !== undefined) data.requiredPermission = input.requiredPermission ?? null;
  if (input.enabled !== undefined) data.enabled = input.enabled;

  const command = await prisma.customCommand.update({ where: { id }, data });

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.customCommand.update',
    targetType: 'CustomCommand',
    targetId: id,
    metadata: { changed: Object.keys(data) },
  });

  res.json({ command });
});

/** DELETE /v1/guilds/:guildId/custom-commands/:id */
const deleteRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  const { id } = parse(idParamSchema, req.params, 'params');

  const deleted = await prisma.customCommand.deleteMany({ where: { id, guildId: guild.id } });
  if (deleted.count === 0) throw new AppError(ERROR_CODES.NOT_FOUND, 'Custom command not found', 404);

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.customCommand.delete',
    targetType: 'CustomCommand',
    targetId: id,
  });

  res.status(204).send();
});

export function customCommandsRouter(): Router {
  const router = Router();
  router.get('/', requireScope(SCOPES.GUILDS_READ), listRoute);
  router.post('/', requireScope(SCOPES.GUILDS_WRITE), createRoute);
  router.get('/:id', requireScope(SCOPES.GUILDS_READ), getRoute);
  router.patch('/:id', requireScope(SCOPES.GUILDS_WRITE), updateRoute);
  router.delete('/:id', requireScope(SCOPES.GUILDS_WRITE), deleteRoute);
  return router;
}
