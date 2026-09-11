import { Router } from 'express';
import { prisma, type Prisma } from '@nexora/database';
import { welcomeConfigInputSchema } from '@nexora/validation';
import { limitsForPlan } from '@nexora/types';
import type { RequestHandler } from 'express';
import { asyncH } from '../lib/async';
import { getApiKey, requireScope, SCOPES } from '../auth/api-key';
import { requireGuild } from '../lib/guild-access';
import { resolveGuildPlan } from '../lib/plan';
import { auditApiCall } from '../lib/audit';
import { parse } from '../lib/http';
import { AppError, ERROR_CODES } from '../lib/errors';

/** GET /v1/guilds/:guildId/welcome/config */
const getConfigRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const config = await prisma.welcomeConfig.findUnique({ where: { guildId: guild.id } });
  res.json({ config });
});

/**
 * PUT /v1/guilds/:guildId/welcome/config
 *
 * Rendered welcome/farewell image cards are a premium feature
 * (PLAN_LIMITS.welcomeCards) — enabling them on a plan without the flag
 * returns 403 PLAN_LIMIT_EXCEEDED.
 */
const putConfigRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  const input = parse(welcomeConfigInputSchema, req.body, 'body');

  const plan = await resolveGuildPlan(guild.id, key.userId);
  if (!limitsForPlan(plan).welcomeCards && (input.welcomeCardEnabled || input.farewellCardEnabled)) {
    throw new AppError(
      ERROR_CODES.PLAN_LIMIT_EXCEEDED,
      `Welcome/farewell image cards are not available on the ${plan} plan`,
      403,
      { plan, requiredPlan: 'PRO' },
    );
  }

  const data = {
    welcomeEnabled: input.welcomeEnabled,
    welcomeChannelId: input.welcomeChannelId ?? null,
    welcomeMessage: (input.welcomeMessage ?? undefined) as Prisma.InputJsonValue | undefined,
    welcomeDmEnabled: input.welcomeDmEnabled,
    welcomeDmMessage: (input.welcomeDmMessage ?? undefined) as Prisma.InputJsonValue | undefined,
    welcomeCardEnabled: input.welcomeCardEnabled,
    autoRoleIds: input.autoRoleIds,
    farewellEnabled: input.farewellEnabled,
    farewellChannelId: input.farewellChannelId ?? null,
    farewellMessage: (input.farewellMessage ?? undefined) as Prisma.InputJsonValue | undefined,
    farewellCardEnabled: input.farewellCardEnabled,
  };

  const config = await prisma.welcomeConfig.upsert({
    where: { guildId: guild.id },
    create: { guildId: guild.id, ...data },
    update: data,
  });

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.welcomeConfig.update',
    targetType: 'WelcomeConfig',
    targetId: config.id,
    metadata: { welcomeEnabled: config.welcomeEnabled, farewellEnabled: config.farewellEnabled },
  });

  res.json({ config });
});

export function welcomeRouter(): Router {
  const router = Router();
  router.get('/config', requireScope(SCOPES.GUILDS_READ), getConfigRoute);
  router.put('/config', requireScope(SCOPES.GUILDS_WRITE), putConfigRoute);
  return router;
}
