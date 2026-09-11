import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import type { RequestHandler } from 'express';
import { asyncH } from '../lib/async';
import { getDiscordUser, discordTokenAuth } from '../lib/discord-token';
import { SCOPES, hashApiKey, API_KEY_PREFIX } from '../auth/api-key';
import { resolveUserLimits } from '../lib/plan';
import { consumeKeyRateLimit } from '../lib/rate-limit';
import { auditApiCall } from '../lib/audit';
import { parse, paginated, parsePagination, offset } from '../lib/http';
import { AppError, ERROR_CODES } from '../lib/errors';
import type { AppDeps } from '../lib/deps';

const idParamSchema = z.object({ id: z.string().min(10).max(64) });

const ALL_SCOPES = Object.values(SCOPES) as [string, ...string[]];

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(ALL_SCOPES)).min(1),
  rateLimitPerMinute: z.number().int().min(1).max(600).default(60),
});

const MAX_KEY_ACTIONS_PER_MINUTE = 20;

/** Key representation that NEVER includes the hash or raw key material. */
function redactKey(key: {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  rateLimitPerMinute: number;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}): Record<string, unknown> {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    scopes: key.scopes,
    rateLimitPerMinute: key.rateLimitPerMinute,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
    createdAt: key.createdAt,
  };
}

/**
 * Audit a key-management mutation. The actor is the Discord-authenticated user
 * (actorType 'API' keeps the audit trail uniform with other API mutations).
 */
async function auditKeyMutation(
  deps: AppDeps,
  userId: string,
  action: string,
  targetId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: 'API',
        actorId: userId,
        action,
        targetType: 'ApiKey',
        targetId,
        metadata: metadata as never,
      },
    });
  } catch (err) {
    deps.logger.error({ err: String(err), action }, 'Failed to write audit log entry');
  }
}

/** GET /v1/keys — list the authenticated user's keys (revoked included). */
const listRoute: RequestHandler = asyncH(async (req, res) => {  const user = getDiscordUser(req);
  const { page, pageSize } = parsePagination(req.query);
  const includeRevoked = req.query.includeRevoked !== 'false';

  const where = { userId: user.userId, ...(includeRevoked ? {} : { revokedAt: null }) };
  const [total, items] = await Promise.all([
    prisma.apiKey.count({ where }),
    prisma.apiKey.findMany({ where, orderBy: { createdAt: 'desc' }, skip: offset({ page, pageSize }), take: pageSize }),
  ]);

  const { plan, limits } = await resolveUserLimits(user.userId);
  res.json({
    ...paginated(items.map(redactKey), total, page, pageSize),
    plan,
    maxKeys: limits.apiKeys,
  });
});

/**
 * POST /v1/keys — create a key. Plan-gated: FREE users cannot create API keys
 * (PLAN_LIMITS.apiKeys = 0). The raw key is returned EXACTLY ONCE; only its
 * sha256 hash is stored.
 */
const createRoute = (deps: AppDeps): RequestHandler =>
  asyncH(async (req, res) => {
  const user = getDiscordUser(req);
  const input = parse(createKeySchema, req.body, 'body');

  // Key creation hits Discord for token validation plus several DB reads; a
  // per-user limiter keeps it from being hammered.
  await consumeKeyRateLimit(deps.cache, `rl:keys:${user.userId}`, MAX_KEY_ACTIONS_PER_MINUTE);

  const { plan, limits } = await resolveUserLimits(user.userId);
  const activeKeys = await prisma.apiKey.count({ where: { userId: user.userId, revokedAt: null } });
  if (activeKeys >= limits.apiKeys) {
    throw new AppError(
      ERROR_CODES.PLAN_LIMIT_EXCEEDED,
      plan === 'FREE'
        ? 'API keys are not available on the FREE plan (upgrade to PRO or higher)'
        : `API key limit reached (${limits.apiKeys} keys on the ${plan} plan); revoke a key first`,
      403,
      { plan, currentKeys: activeKeys, maxKeys: limits.apiKeys },
    );
  }

  const rawKey = API_KEY_PREFIX + randomBytes(32).toString('hex');
  const key = await prisma.apiKey.create({
    data: {
      userId: user.userId,
      name: input.name,
      keyHash: hashApiKey(rawKey),
      prefix: rawKey.slice(0, 8),
      scopes: input.scopes,
      rateLimitPerMinute: input.rateLimitPerMinute,
    },
  });

  await auditKeyMutation(deps, user.userId, 'api.key.create', key.id, {
    name: key.name,
    scopes: key.scopes,
    rateLimitPerMinute: key.rateLimitPerMinute,
  });

  res.status(201).json({
    key: redactKey(key),
    // Shown ONCE — store it securely; it cannot be retrieved again.
    keyRaw: rawKey,
  });
  });

/** DELETE /v1/keys/:id — revoke a key (soft delete: revokedAt = now). */
const revokeRoute = (deps: AppDeps): RequestHandler =>
  asyncH(async (req, res) => {
  const user = getDiscordUser(req);
  const { id } = parse(idParamSchema, req.params, 'params');

  const key = await prisma.apiKey.findFirst({ where: { id, userId: user.userId } });
  if (!key) throw new AppError(ERROR_CODES.NOT_FOUND, 'API key not found', 404);
  if (key.revokedAt) {
    throw new AppError(ERROR_CODES.CONFLICT, 'API key is already revoked', 409);
  }

  await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });

  await auditKeyMutation(deps, user.userId, 'api.key.revoke', key.id, {
    name: key.name,
  });

  res.status(204).send();
  });

export function keysRouter(deps: AppDeps): Router {
  const router = Router();
  // Key management is authenticated with the user's Discord access token, not
  // with an API key (a key that can mint keys would defeat scope enforcement).
  router.use(discordTokenAuth(deps.logger));
  router.get('/', listRoute);
  router.post('/', createRoute(deps));
  router.delete('/:id', revokeRoute(deps));
  return router;
}
