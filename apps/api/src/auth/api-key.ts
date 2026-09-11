/**
 * API key authentication.
 *
 * Keys are created by the dashboard, which writes the ApiKey row directly to
 * the database (key creation is a dashboard-session flow, deliberately NOT
 * exposed over this API — an API that can mint its own keys would make scope
 * enforcement meaningless). The raw key is shown to the user exactly once at
 * creation time; only `sha256(rawKey)` is stored (`ApiKey.keyHash`).
 *
 * This API authenticates keys only:
 *   Authorization: Bearer nxk_<random>
 */
import { createHash } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import type { Cache } from '@nexora/cache';
import { prisma } from '@nexora/database';
import { AppError, ERROR_CODES } from '../lib/errors';

export const API_KEY_PREFIX = 'nxk_';

/** OAuth-style resource scopes. A key's scopes are fixed at creation. */
export const SCOPES = {
  GUILDS_READ: 'guilds:read',
  GUILDS_WRITE: 'guilds:write',
  ANALYTICS_READ: 'analytics:read',
  WEBHOOKS_MANAGE: 'webhooks:manage',
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

export interface ApiKeyContext {
  id: string;
  name: string;
  prefix: string;
  userId: string;
  scopes: string[];
  rateLimitPerMinute: number;
  createdAt: Date;
}

const BEARER_PATTERN = new RegExp(`^Bearer (${API_KEY_PREFIX}[A-Za-z0-9_-]{16,128})$`);

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

/** Fetch the authenticated API key context or throw 401. */
export function getApiKey(req: Request): ApiKeyContext {
  if (!req.apiKey) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 'API key authentication required', 401);
  }
  return req.apiKey;
}

/**
 * Authenticate the request and enforce the per-key rate limit
 * (`ratelimit:<apiKeyId>` counter in the shared cache, 60s window).
 */
export function apiKeyAuth(cache: Cache): RequestHandler {
  return (req, _res, next): void => {
    void (async (): Promise<void> => {
      try {
        const header = req.headers.authorization;
        const match = typeof header === 'string' ? BEARER_PATTERN.exec(header) : null;
        if (!match) {
          throw new AppError(
            ERROR_CODES.UNAUTHORIZED,
            `Missing or malformed Authorization header (expected: 'Bearer ${API_KEY_PREFIX}...')`,
            401,
          );
        }

        const keyHash = hashApiKey(match[1]);
        const row = await prisma.apiKey.findUnique({ where: { keyHash } });
        if (!row || row.revokedAt) {
          throw new AppError(ERROR_CODES.INVALID_API_KEY, 'API key not found or revoked', 401);
        }

        // Per-key sliding rate limit: one counter per key, reset every 60s window.
        const rateKey = `ratelimit:${row.id}`;
        const count = await cache.incrTtl(rateKey, 60);
        if (count > row.rateLimitPerMinute) {
          const ttl = await cache.ttl(rateKey);
          const retryAfter = Math.max(1, ttl);
          _res.setHeader('Retry-After', String(retryAfter));
          throw new AppError(
            ERROR_CODES.RATE_LIMITED,
            `API key rate limit exceeded (${row.rateLimitPerMinute} requests/minute); retry after ${retryAfter}s`,
            429,
            { retryAfterSeconds: retryAfter },
          );
        }

        await prisma.apiKey.update({
          where: { id: row.id },
          data: { lastUsedAt: new Date() },
        });

        req.apiKey = {
          id: row.id,
          name: row.name,
          prefix: row.prefix,
          userId: row.userId,
          scopes: row.scopes,
          rateLimitPerMinute: row.rateLimitPerMinute,
          createdAt: row.createdAt,
        };
        next();
      } catch (err) {
        next(err);
      }
    })();
  };
}

/**
 * Scope enforcement helper. Must run after `apiKeyAuth`.
 * Usage: `requireScope(SCOPES.GUILDS_READ)`.
 */
export function requireScope(scope: string): RequestHandler {
  return (req, _res, next): void => {
    const key = req.apiKey;
    if (!key) {
      next(new AppError(ERROR_CODES.UNAUTHORIZED, 'API key authentication required', 401));
      return;
    }
    if (!key.scopes.includes(scope)) {
      next(
        new AppError(
          ERROR_CODES.INSUFFICIENT_SCOPE,
          `This endpoint requires the '${scope}' scope`,
          403,
          { requiredScope: scope, grantedScopes: key.scopes },
        ),
      );
      return;
    }
    next();
  };
}
