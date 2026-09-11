import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import { snowflakeSchema, escalationConfigSchema } from '@nexora/validation';
import { limitsForPlan } from '@nexora/types';
import type { RequestHandler, Router as RouterType } from 'express';
import { asyncH } from '../lib/async';
import { getApiKey, requireScope, SCOPES } from '../auth/api-key';
import { requireGuild } from '../lib/guild-access';
import { resolveGuildPlan } from '../lib/plan';
import { auditApiCall } from '../lib/audit';
import { parse, paginated, parsePagination, offset } from '../lib/http';
import { AppError, ERROR_CODES } from '../lib/errors';
import type { AppDeps } from '../lib/deps';
import { moderationRouter } from './moderation';
import { analyticsRouter } from './analytics';
import { leaderboardRouter } from './leaderboard';
import { ticketsRouter } from './tickets';
import { giveawaysRouter } from './giveaways';
import { automationsRouter } from './automations';
import { customCommandsRouter } from './custom-commands';
import { autoModRulesRouter } from './automod-rules';
import { webhooksRouter } from './webhooks';
import { backupsRouter } from './backups';
import { levelingRouter } from './leveling';
import { economyRouter } from './economy';
import { welcomeRouter } from './welcome';
import { loggingRouter } from './logging';

/**
 * Guild-scoped routes. Everything mounted under /v1/guilds/:guildId goes
 * through: API key auth -> snowflake validation -> guild access guard.
 */

/** Validate that :guildId is a Discord snowflake before touching the DB. */
const validateGuildIdParam: RequestHandler = (req, _res, next) => {
  const result = snowflakeSchema.safeParse(req.params.guildId);
  if (!result.success) {
    next(new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid guildId: must be a Discord snowflake', 400));
    return;
  }
  next();
};

/** Load the guild and verify the key owner has staff access (or 404/403). */
const requireGuildAccess: RequestHandler = asyncH(async (req, _res, next) => {
  const key = getApiKey(req);
  const guildId = req.params.guildId;

  const guild = await prisma.guild.findFirst({
    where: { id: guildId, botLeftAt: null },
  });
  if (!guild) {
    throw new AppError(ERROR_CODES.GUILD_NOT_FOUND, 'Guild not found or the bot is not in it', 404);
  }

  const staffMembership = await prisma.guildMember.findFirst({
    where: { userId: key.userId, guildId, isStaff: true, leftAt: null },
    select: { id: true },
  });
  if (!staffMembership) {
    throw new AppError(ERROR_CODES.GUILD_ACCESS_DENIED, 'You do not have staff access to this guild', 403);
  }

  req.guild = guild;
  next();
});

/** PATCH /v1/guilds/:guildId/settings body schema. */
const guildSettingsPatchSchema = z
  .object({
    prefix: z.string().min(1).max(5).optional(),
    language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'BCP-47 style like "en" or "pt-BR"').optional(),
    timezone: z.string().min(1).max(64).optional(),
    embedColor: z.number().int().min(0).max(0xffffff).optional(),
    premiumBannerEnabled: z.boolean().optional(),
    customBranding: z.boolean().optional(),
    escalateOnWarn: z.boolean().optional(),
    modLogChannelId: snowflakeSchema.nullable().optional(),
    commandCooldownSeconds: z.number().int().min(0).max(3600).optional(),
    disabledCommands: z.array(z.string().min(1).max(64)).max(500).optional(),
    escalating: escalationConfigSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: 'No settings provided' });

/** GET /v1/guilds — guilds the key owner has staff access to. */
export function listGuildsRoute(): RequestHandler {
  return asyncH(async (req, res) => {
    const key = getApiKey(req);
    const { page, pageSize } = parsePagination(req.query);

    const where = {
      userId: key.userId,
      isStaff: true,
      leftAt: null,
      guild: { active: true, botLeftAt: null },
    };

    const [total, memberships] = await Promise.all([
      prisma.guildMember.count({ where }),
      prisma.guildMember.findMany({
        where,
        include: { guild: { include: { settings: { select: { prefix: true, language: true } } } } },
        orderBy: { joinedAt: 'desc' },
        skip: offset({ page, pageSize }),
        take: pageSize,
      }),
    ]);

    const items = memberships.map((m) => ({
      guildId: m.guildId,
      name: m.guild.name,
      icon: m.guild.icon,
      memberCount: m.guild.memberCount,
      joinedAt: m.joinedAt,
      prefix: m.guild.settings?.prefix ?? null,
      language: m.guild.settings?.language ?? null,
    }));

    res.json(paginated(items, total, page, pageSize));
  });
}

/** GET /v1/guilds/:guildId — overview: guild, settings, plan and feature flags. */
const guildOverviewRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);

  const [settings, plan] = await Promise.all([
    prisma.guildSettings.findUnique({ where: { guildId: guild.id } }),
    resolveGuildPlan(guild.id, key.userId),
  ]);
  const limits = limitsForPlan(plan);

  res.json({
    guild: {
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      memberCount: guild.memberCount,
      shardId: guild.shardId,
      createdAt: guild.createdAt,
    },
    settings,
    plan,
    limits,
    featureFlags: {
      ai: limits.ai,
      welcomeCards: limits.welcomeCards,
      customBranding: limits.customBranding,
      extendedLogs: limits.extendedLogs,
      economy: limits.economy,
    },
  });
});

/** GET /v1/guilds/:guildId/settings */
const getSettingsRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const settings = await prisma.guildSettings.findUnique({ where: { guildId: guild.id } });
  res.json({ settings });
});

/** PATCH /v1/guilds/:guildId/settings — validated, plan-gated, audit logged. */
const patchSettingsRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  const input = parse(guildSettingsPatchSchema, req.body, 'body');

  const plan = await resolveGuildPlan(guild.id, key.userId);
  const limits = limitsForPlan(plan);

  // Plan-gated branding features.
  if ((input.customBranding === true || input.premiumBannerEnabled === true) && !limits.customBranding) {
    throw new AppError(
      ERROR_CODES.PLAN_LIMIT_EXCEEDED,
      `customBranding / premium banners are not available on the ${plan} plan`,
      403,
      { requiredPlan: 'PRO', plan },
    );
  }

  const before = await prisma.guildSettings.findUnique({ where: { guildId: guild.id } });
  const settings = await prisma.guildSettings.upsert({
    where: { guildId: guild.id },
    create: { guildId: guild.id, ...input },
    update: { ...input },
  });

  const changed = Object.keys(input).filter(
    (field) =>
      !before ||
      JSON.stringify((input as Record<string, unknown>)[field]) !==
        JSON.stringify((before as unknown as Record<string, unknown>)[field]),
  );

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.settings.update',
    targetType: 'GuildSettings',
    targetId: settings.id,
    metadata: { changed },
  });

  res.json({ settings });
});

/** All /v1/guilds/:guildId/* sub-routes. */
export function createGuildRouter(deps: AppDeps): RouterType {
  const router = Router();

  router.use(validateGuildIdParam);
  router.use(requireGuildAccess);

  router.get('/', requireScope(SCOPES.GUILDS_READ), guildOverviewRoute);
  router.get('/settings', requireScope(SCOPES.GUILDS_READ), getSettingsRoute);
  router.patch('/settings', requireScope(SCOPES.GUILDS_WRITE), patchSettingsRoute);

  router.use('/moderation', moderationRouter());
  router.use('/analytics', analyticsRouter());
  router.use('/leaderboard', leaderboardRouter());
  router.use('/tickets', ticketsRouter());
  router.use('/giveaways', giveawaysRouter());
  router.use('/automations', automationsRouter());
  router.use('/custom-commands', customCommandsRouter());
  router.use('/automod-rules', autoModRulesRouter());
  router.use('/webhooks', webhooksRouter());
  router.use('/backups', backupsRouter(deps));
  router.use('/leveling', levelingRouter());
  router.use('/economy', economyRouter());
  router.use('/welcome', welcomeRouter());
  router.use('/logging', loggingRouter());

  return router;
}
