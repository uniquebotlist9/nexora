import { prisma } from '@nexora/database';
import { getEnv } from '@nexora/config';
import type { ServiceHealth } from '@nexora/types';
import type { RequestHandler } from 'express';
import type { AppDeps } from '../lib/deps';
import { asyncH } from '../lib/async';

const startedAt = Date.now();

const { version } = require('../../package.json') as { version: string };

/**
 * GET /health — public service health probe (no authentication).
 * Checks: Prisma query round-trip, cache health, and reports discord as
 * 'unknown' (the bot process owns the Discord connection, not the API).
 */
export function healthRoute(deps: AppDeps): RequestHandler {
  return asyncH(async (_req, res) => {
    let database: ServiceHealth['checks']['database'] = 'ok';
    try {
      // MongoDB connector: a trivial single-document query proves connectivity.
      await prisma.user.findFirst({ select: { id: true }, take: 1 });
    } catch {
      database = 'down';
    }

    const redisConfigured = Boolean(getEnv().REDIS_URL);
    const redis: ServiceHealth['checks']['redis'] = !redisConfigured
      ? 'disabled'
      : (await deps.cache.healthy())
        ? 'ok'
        : 'down';

    const status: ServiceHealth['status'] =
      database === 'down' ? 'down' : redis === 'down' ? 'degraded' : 'ok';

    const health: ServiceHealth = {
      status,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      version,
      checks: { database, redis, discord: 'unknown' },
    };

    res.status(status === 'down' ? 503 : 200).json(health);
  });
}
