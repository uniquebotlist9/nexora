import { prisma } from '@nexora/database';
import type { RequestHandler } from 'express';
import { asyncH } from '../lib/async';
import { getApiKey } from '../auth/api-key';

/**
 * GET /v1/me — info about the authenticated API key and its owner.
 * Auth: valid API key (any scope).
 */
export function meRoute(): RequestHandler {
  return asyncH(async (req, res) => {
    const key = getApiKey(req);

    const owner = await prisma.user.findUnique({
      where: { id: key.userId },
      select: { id: true, createdAt: true, lastSeenAt: true },
    });

    res.json({
      key: {
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        scopes: key.scopes,
        rateLimitPerMinute: key.rateLimitPerMinute,
        createdAt: key.createdAt,
      },
      owner,
    });
  });
}
