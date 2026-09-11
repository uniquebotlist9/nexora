import { Router } from 'express';
import { prisma, type Prisma } from '@nexora/database';
import { logConfigInputSchema } from '@nexora/validation';
import { limitsForPlan } from '@nexora/types';
import type { RequestHandler } from 'express';
import { asyncH } from '../lib/async';
import { getApiKey, requireScope, SCOPES } from '../auth/api-key';
import { requireGuild } from '../lib/guild-access';
import { resolveGuildPlan } from '../lib/plan';
import { auditApiCall } from '../lib/audit';
import { parse } from '../lib/http';
import { AppError, ERROR_CODES } from '../lib/errors';

/** GET /v1/guilds/:guildId/logging/config */
const getConfigRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const config = await prisma.logConfig.findUnique({ where: { guildId: guild.id } });
  res.json({ config });
});

/** PUT /v1/guilds/:guildId/logging/config */
const putConfigRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  const input = parse(logConfigInputSchema, req.body, 'body');

  // Extended log retention is premium (PLAN_LIMITS.extendedLogs); the API only
  // stores the config, but flag-holders expect the extended retention to be a
  // paid feature, so reject enabling logging config with... (retention itself
  // is enforced by the bot's retention job; here we only gate the flag on plan
  // when the caller tries to enable categories beyond the free set).
  const plan = await resolveGuildPlan(guild.id, key.userId);
  const extendedCategories = ['invites', 'verification', 'automod'] as const;
  const wantsExtended = Object.entries(input.config).some(
    ([category, cfg]) => cfg.enabled && (extendedCategories as readonly string[]).includes(category),
  );
  if (wantsExtended && !limitsForPlan(plan).extendedLogs) {
    throw new AppError(
      ERROR_CODES.PLAN_LIMIT_EXCEEDED,
      `The ${extendedCategories.join('/')} log categories require extended logs (not available on the ${plan} plan)`,
      403,
      { plan, requiredPlan: 'PRO' },
    );
  }

  const data = {
    enabled: input.enabled,
    categories: input.config as unknown as Prisma.InputJsonValue,
    ignoredChannelIds: input.ignoredChannelIds,
  };

  const config = await prisma.logConfig.upsert({
    where: { guildId: guild.id },
    create: { guildId: guild.id, ...data },
    update: data,
  });

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.logConfig.update',
    targetType: 'LogConfig',
    targetId: config.id,
    metadata: { enabled: config.enabled, categories: Object.keys(input.config) },
  });

  res.json({ config });
});

export function loggingRouter(): Router {
  const router = Router();
  router.get('/config', requireScope(SCOPES.GUILDS_READ), getConfigRoute);
  router.put('/config', requireScope(SCOPES.GUILDS_WRITE), putConfigRoute);
  return router;
}
