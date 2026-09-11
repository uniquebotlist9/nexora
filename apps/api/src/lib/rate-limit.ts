/**
 * Rate limiting.
 *
 * Two layers:
 *  1. Global IP limiter (express-rate-limit, in-process): 300 requests/minute
 *     per client IP. Protects unauthenticated endpoints (health, payment
 *     webhooks) and blunts credential-stuffing against the key auth itself.
 *  2. Per-API-key limiter: enforced in auth/api-key.ts via a shared cache
 *     counter (`ratelimit:<apiKeyId>`, 60s window) so it is effective across
 *     multiple API instances when Redis is configured.
 */
import rateLimit from 'express-rate-limit';
import type { Cache } from '@nexora/cache';
import type { RequestHandler } from 'express';
import { AppError, ERROR_CODES } from './errors';

/** Global per-IP limiter: 300 req/min (standard + validation error responses excluded from skew). */
export function globalRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Express-rate-limit returns its own HTML/JSON body; we keep the platform
    // error envelope by delegating to the global error handler.
    handler: (_req, _res, next) => {
      next(
        new AppError(
          ERROR_CODES.RATE_LIMITED,
          'Too many requests from this IP; slow down (300 requests/minute)',
          429,
          { retryAfterSeconds: 60 },
        ),
      );
    },
  }) as RequestHandler;
}

/**
 * Consume one unit of the per-key rate limit budget. Returns the current
 * window count, or throws a 429 AppError (with Retry-After details) when the
 * key's budget is exhausted. Exposed separately so custom auth flows (e.g.
 * Discord-token based key management) can apply key-style limits without
 * duplicating the logic.
 */
export async function consumeKeyRateLimit(
  cache: Cache,
  cacheKey: string,
  limitPerMinute: number,
): Promise<void> {
  const count = await cache.incrTtl(cacheKey, 60);
  if (count > limitPerMinute) {
    const ttl = await cache.ttl(cacheKey);
    const retryAfter = Math.max(1, ttl);
    throw new AppError(
      ERROR_CODES.RATE_LIMITED,
      `Rate limit exceeded (${limitPerMinute} requests/minute); retry after ${retryAfter}s`,
      429,
      { retryAfterSeconds: retryAfter },
    );
  }
}
