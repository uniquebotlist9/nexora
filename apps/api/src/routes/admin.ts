/**
 * Admin-scoped routes (/v1/admin/*).
 *
 * These endpoints are ONLY for the admin panel's server-side calls and are
 * guarded by the internal HMAC token (X-Nexora-Internal) derived from
 * ENCRYPTION_KEY — see src/auth/internal.ts. They are NOT reachable with
 * regular API keys: admin data spans all guilds, so per-guild key scopes do
 * not apply and must not apply.
 *
 * DESIGN NOTE — announcements: there is no Announcement model in the schema,
 * so no POST /v1/admin/announcements endpoint exists (adding a fake one that
 * writes rows into an unrelated model would be worse than none). When an
 * announcements feature lands, it gets its own model + endpoint here.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import { PLAN_TIERS } from '@nexora/types';
import type { RequestHandler } from 'express';
import { asyncH } from '../lib/async';
import { internalGuard } from '../auth/internal';
import { parse, paginated, parsePagination, offset } from '../lib/http';
import type { AppDeps } from '../lib/deps';

/** GET /v1/admin/stats — platform-wide totals. */
const statsRoute: RequestHandler = asyncH(async (_req, res) => {
  const [totalGuilds, activeGuilds, totalUsers, subsByPlan, paymentAgg] = await Promise.all([
    prisma.guild.count(),
    prisma.guild.count({ where: { active: true, botLeftAt: null } }),
    prisma.user.count(),
    prisma.subscription.groupBy({
      by: ['plan', 'status'],
      _count: { _all: true },
    }),
    prisma.paymentEvent.aggregate({
      where: { type: 'payment.succeeded' },
      _count: { _all: true },
    }),
  ]);

  const subscriptionsByPlan: Record<string, number> = {};
  for (const tier of PLAN_TIERS) subscriptionsByPlan[tier] = 0;
  for (const group of subsByPlan) {
    if (group.status === 'ACTIVE' || group.status === 'TRIALING') {
      subscriptionsByPlan[group.plan] = (subscriptionsByPlan[group.plan] ?? 0) + group._count._all;
    }
  }

  res.json({
    guilds: { total: totalGuilds, active: activeGuilds },
    users: { total: totalUsers },
    subscriptionsByPlan,
    payments: { succeededEvents: paymentAgg._count._all },
  });
});

const guildsQuerySchema = z.object({
  search: z.string().min(1).max(100).optional(),
});

/** GET /v1/admin/guilds — paginated, searchable list of all guilds. */
const guildsRoute: RequestHandler = asyncH(async (req, res) => {
  const { page, pageSize } = parsePagination(req.query);
  const { search } = parse(guildsQuerySchema, req.query, 'query');

  const where = search
    ? {
        OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { id: search }],
      }
    : {};

  const [total, items] = await Promise.all([
    prisma.guild.count({ where }),
    prisma.guild.findMany({
      where,
      orderBy: { memberCount: 'desc' },
      skip: offset({ page, pageSize }),
      take: pageSize,
      select: {
        id: true,
        name: true,
        icon: true,
        memberCount: true,
        active: true,
        shardId: true,
        botLeftAt: true,
        createdAt: true,
      },
    }),
  ]);

  res.json(paginated(items, total, page, pageSize));
});

/** GET /v1/admin/health — service + queue depth. */
const adminHealthRoute = (deps: AppDeps): RequestHandler =>
  asyncH(async (_req, res) => {
    const [pendingDeliveries, retryingDeliveries, pendingTasks, dbOk, cacheOk] = await Promise.all([
      prisma.webhookDelivery.count({ where: { status: 'PENDING' } }),
      prisma.webhookDelivery.count({ where: { status: 'RETRYING' } }),
      prisma.scheduledTask.count({ where: { completedAt: null, failedAt: null } }),
      // MongoDB connector: a trivial query proves connectivity.
      prisma
        .guild.findFirst({ select: { id: true }, take: 1 })
        .then(() => true)
        .catch(() => false),
      deps.cache.healthy(),
    ]);

    res.json({
      status: dbOk && cacheOk ? 'ok' : 'degraded',
      checks: {
        database: dbOk ? 'ok' : 'down',
        cache: cacheOk ? 'ok' : 'down',
      },
      queue: {
        webhookDeliveriesPending: pendingDeliveries,
        webhookDeliveriesRetrying: retryingDeliveries,
        scheduledTasksPending: pendingTasks,
      },
    });
  });

const commandStatsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** GET /v1/admin/command-stats — top commands by total uses. */
const commandStatsRoute: RequestHandler = asyncH(async (req, res) => {
  const { limit } = parse(commandStatsQuerySchema, req.query, 'query');

  const top = await prisma.commandStat.groupBy({
    by: ['commandName'],
    _sum: { uses: true },
    orderBy: { _sum: { uses: 'desc' } },
    take: limit,
  });

  res.json({
    items: top.map((row) => ({ commandName: row.commandName, totalUses: row._sum.uses ?? 0 })),
  });
});

export function adminRouter(deps: AppDeps): Router {
  const router = Router();
  router.use(internalGuard());

  router.get('/stats', statsRoute);
  router.get('/guilds', guildsRoute);
  router.get('/health', adminHealthRoute(deps));
  router.get('/command-stats', commandStatsRoute);

  return router;
}
