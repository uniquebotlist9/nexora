import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import { PLAN_TIERS, SUBSCRIPTION_STATUSES } from '@nexora/types';
import { snowflakeSchema } from '@nexora/validation';
import type { RequestHandler } from 'express';
import { asyncH } from '../lib/async';
import { internalGuard } from '../auth/internal';
import { parse } from '../lib/http';
import { AppError, ERROR_CODES } from '../lib/errors';

/**
 * Internal service endpoints (admin panel / bot backend).
 *
 * Auth: X-Nexora-Internal HMAC header (internalGuard), never API keys — these
 * endpoints span all guilds and users, so per-guild scope checks do not apply.
 */

const guildIdParamSchema = z.object({ id: snowflakeSchema });

const subscriptionUpsertSchema = z
  .object({
    userId: snowflakeSchema,
    guildId: snowflakeSchema.nullable().default(null),
    plan: z.enum(PLAN_TIERS),
    status: z.enum(SUBSCRIPTION_STATUSES).default('ACTIVE'),
    provider: z.string().min(1).max(32).default('internal'),
    providerRef: z.string().min(1).max(255).nullable().optional(),
    currentPeriodEnd: z.coerce.date().nullable().optional(),
    cancelAtPeriodEnd: z.boolean().default(false),
  })
  .strict();

/**
 * GET /v1/internal/stats — platform totals for the admin dashboard.
 */
const statsRoute: RequestHandler = asyncH(async (_req, res) => {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const [
    guilds,
    activeGuilds,
    users,
    activeMemberships,
    commandsActiveToday,
    commandsTracked,
    activeSubscriptions,
    subscriptionsByPlan,
    openTickets,
    pendingScheduledTasks,
    pendingWebhookDeliveries,
    apiKeysActive,
  ] = await Promise.all([
    prisma.guild.count(),
    prisma.guild.count({ where: { active: true, botLeftAt: null } }),
    prisma.user.count(),
    prisma.guildMember.count({ where: { leftAt: null } }),
    // CommandStat tracks lifetime uses per (command, guild), so "today" can
    // only be approximated via lastUsedAt — this is the number of distinct
    // commands used today, not a use count.
    prisma.commandStat.count({ where: { lastUsedAt: { gte: startOfDay } } }),
    prisma.commandStat.aggregate({ _sum: { uses: true } }),
    prisma.subscription.count({ where: { status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } } }),
    prisma.subscription.groupBy({
      by: ['plan'],
      where: { status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
      _count: { _all: true },
    }),
    prisma.ticket.count({ where: { status: { in: ['OPEN', 'CLAIMED', 'REOPENED'] } } }),
    prisma.scheduledTask.count({ where: { completedAt: null, failedAt: null } }),
    prisma.webhookDelivery.count({ where: { status: { in: ['PENDING', 'RETRYING'] } } }),
    prisma.apiKey.count({ where: { revokedAt: null } }),
  ]);

  res.json({
    guilds: {
      total: guilds,
      active: activeGuilds,
    },
    users: {
      total: users,
      // memberships (user, guild) currently active — a user in N guilds counts N times
      activeMemberships,
    },
    commands: {
      distinctUsedToday: commandsActiveToday,
      usesTotal: commandsTracked._sum.uses ?? 0,
    },
    subscriptions: {
      active: activeSubscriptions,
      byPlan: Object.fromEntries(subscriptionsByPlan.map((row) => [row.plan, row._count._all])),
    },
    tickets: { open: openTickets },
    scheduledTasks: { pending: pendingScheduledTasks },
    webhookDeliveries: { pending: pendingWebhookDeliveries },
    apiKeys: { active: apiKeysActive },
    generatedAt: new Date().toISOString(),
  });
});

/**
 * GET /v1/internal/guilds/:id — full configuration dump for one guild.
 * Used by the admin panel's guild inspector. Secrets (webhook endpoint
 * signing secrets) are never included.
 */
const guildDumpRoute: RequestHandler = asyncH(async (req, res) => {
  const { id } = parse(guildIdParamSchema, req.params, 'params');

  const guild = await prisma.guild.findUnique({
    where: { id },
    include: {
      settings: true,
      welcome: true,
      logConfig: true,
      ticketConfig: true,
      leveling: true,
      economy: true,
      antiRaid: true,
      verification: true,
      suggestionConfigs: true,
      starboardConfig: true,
      _count: {
        select: {
          members: true,
          modCases: true,
          tickets: true,
          giveaways: true,
          automations: true,
          autoModRules: true,
          customCommands: true,
          backups: true,
          scheduledTasks: true,
          warnings: true,
          economyAccounts: true,
          shopItems: true,
          reactionRoleMessages: true,
          suggestions: true,
          logEvents: true,
          analyticsDaily: true,
        },
      },
    },
  });
  if (!guild) throw new AppError(ERROR_CODES.NOT_FOUND, 'Guild not found', 404);

  const [subscription, webhookEndpoints, recentCases] = await Promise.all([
    prisma.subscription.findFirst({
      where: { guildId: id, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.webhookEndpoint.findMany({
      where: { guildId: id },
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        status: true,
        failureCount: true,
        lastDeliveryAt: true,
        lastStatusCode: true,
        createdAt: true,
      },
    }),
    prisma.moderationCase.findMany({
      where: { guildId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, caseNumber: true, type: true, targetUserId: true, reason: true, createdAt: true },
    }),
  ]);

  res.json({ guild, subscription, webhookEndpoints, recentCases });
});

/**
 * POST /v1/internal/subscriptions — create or update a subscription
 * (manual grants by admins, or reconciliation from the bot).
 */
const upsertSubscriptionRoute: RequestHandler = asyncH(async (req, res) => {
  const input = parse(subscriptionUpsertSchema, req.body, 'body');

  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
  if (!user) throw new AppError(ERROR_CODES.NOT_FOUND, `User ${input.userId} does not exist`, 404);
  if (input.guildId) {
    const guild = await prisma.guild.findUnique({ where: { id: input.guildId }, select: { id: true } });
    if (!guild) throw new AppError(ERROR_CODES.NOT_FOUND, `Guild ${input.guildId} does not exist`, 404);
  }

  // Upsert key: one subscription per (user, guild, provider) — for a user-level
  // sub the guild slot is null.
  const existing = await prisma.subscription.findFirst({
    where: { userId: input.userId, guildId: input.guildId, provider: input.provider },
    orderBy: { createdAt: 'desc' },
  });

  const data = {
    userId: input.userId,
    guildId: input.guildId,
    plan: input.plan,
    status: input.status,
    provider: input.provider,
    providerRef: input.providerRef ?? null,
    currentPeriodEnd: input.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd,
  };

  const subscription = existing
    ? await prisma.subscription.update({ where: { id: existing.id }, data })
    : await prisma.subscription.create({ data });

  await prisma.auditLog.create({
    data: {
      actorType: 'SYSTEM',
      actorId: null,
      guildId: input.guildId,
      action: existing ? 'internal.subscription.update' : 'internal.subscription.create',
      targetType: 'Subscription',
      targetId: subscription.id,
      metadata: { plan: subscription.plan, status: subscription.status, provider: subscription.provider },
    },
  });

  res.status(existing ? 200 : 201).json({ subscription, created: !existing });
});

export function internalRouter(): Router {
  const router = Router();
  router.use(internalGuard());
  router.get('/stats', statsRoute);
  router.get('/guilds/:id', guildDumpRoute);
  router.post('/subscriptions', upsertSubscriptionRoute);
  return router;
}
