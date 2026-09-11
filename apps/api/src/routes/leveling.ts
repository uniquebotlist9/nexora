import { Router } from 'express';
import { z } from 'zod';
import { prisma, type Prisma } from '@nexora/database';
import { snowflakeSchema, levelConfigInputSchema } from '@nexora/validation';
import type { RequestHandler } from 'express';
import { asyncH } from '../lib/async';
import { getApiKey, requireScope, SCOPES } from '../auth/api-key';
import { requireGuild } from '../lib/guild-access';
import { auditApiCall } from '../lib/audit';
import { parse } from '../lib/http';
import { AppError, ERROR_CODES } from '../lib/errors';

/** Role reward shape (kept identical to levelConfigInputSchema.roleRewards). */
const roleRewardsSchema = z
  .array(
    z.object({
      level: z.number().int().min(1).max(1000),
      roleId: snowflakeSchema,
      keepPrevious: z.boolean().default(false),
    }),
  )
  .max(50);

/** GET /v1/guilds/:guildId/leveling/config */
const getConfigRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const config = await prisma.levelConfig.findUnique({ where: { guildId: guild.id } });
  res.json({ config });
});

/** PUT /v1/guilds/:guildId/leveling/config */
const putConfigRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  const input = parse(levelConfigInputSchema, req.body, 'body');

  if (input.xpMin > input.xpMax) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'xpMin must be <= xpMax', 400);
  }

  const config = await prisma.levelConfig.upsert({
    where: { guildId: guild.id },
    create: {
      guildId: guild.id,
      enabled: input.enabled,
      xpMin: input.xpMin,
      xpMax: input.xpMax,
      cooldownSeconds: input.cooldownSeconds,
      multipliers: input.multipliers as Prisma.InputJsonValue,
      ignoreChannelIds: input.ignoreChannelIds,
      announceChannelId: input.announceChannelId ?? null,
      ...(input.announceTemplate !== undefined ? { announceTemplate: input.announceTemplate } : {}),
      dmEnabled: input.dmEnabled,
      ...(input.dmTemplate !== undefined ? { dmTemplate: input.dmTemplate } : {}),
      roleRewards: input.roleRewards as Prisma.InputJsonValue,
    },
    update: {
      enabled: input.enabled,
      xpMin: input.xpMin,
      xpMax: input.xpMax,
      cooldownSeconds: input.cooldownSeconds,
      multipliers: input.multipliers as Prisma.InputJsonValue,
      ignoreChannelIds: input.ignoreChannelIds,
      announceChannelId: input.announceChannelId ?? null,
      ...(input.announceTemplate !== undefined ? { announceTemplate: input.announceTemplate } : {}),
      dmEnabled: input.dmEnabled,
      ...(input.dmTemplate !== undefined ? { dmTemplate: input.dmTemplate } : {}),
      roleRewards: input.roleRewards as Prisma.InputJsonValue,
    },
  });

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.levelConfig.update',
    targetType: 'LevelConfig',
    targetId: config.id,
    metadata: { enabled: config.enabled, roleRewards: input.roleRewards.length },
  });

  res.json({ config });
});

/** GET /v1/guilds/:guildId/leveling/rewards — the role rewards list. */
const getRewardsRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const config = await prisma.levelConfig.findUnique({
    where: { guildId: guild.id },
    select: { roleRewards: true },
  });
  res.json({ rewards: config?.roleRewards ?? [] });
});

/** PUT /v1/guilds/:guildId/leveling/rewards — replace the role rewards list. */
const putRewardsRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  const rewards = parse(roleRewardsSchema, req.body, 'body');

  const config = await prisma.levelConfig.upsert({
    where: { guildId: guild.id },
    create: { guildId: guild.id, roleRewards: rewards as Prisma.InputJsonValue },
    update: { roleRewards: rewards as Prisma.InputJsonValue },
    select: { id: true, roleRewards: true },
  });

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.leveling.rewards.update',
    targetType: 'LevelConfig',
    targetId: config.id,
    metadata: { count: rewards.length },
  });

  res.json({ rewards: config.roleRewards });
});

export function levelingRouter(): Router {
  const router = Router();
  router.get('/config', requireScope(SCOPES.GUILDS_READ), getConfigRoute);
  router.put('/config', requireScope(SCOPES.GUILDS_WRITE), putConfigRoute);
  router.get('/rewards', requireScope(SCOPES.GUILDS_READ), getRewardsRoute);
  router.put('/rewards', requireScope(SCOPES.GUILDS_WRITE), putRewardsRoute);
  return router;
}
