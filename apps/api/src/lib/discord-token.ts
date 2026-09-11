/**
 * Discord OAuth token authentication for REST endpoints owned by end users
 * (API key management), as opposed to machine endpoints owned by API keys.
 *
 *   Authorization: Bearer <discord_access_token>
 *
 * The token is validated against Discord's /users/@me endpoint on every call —
 * access tokens are short-lived, so caching them would extend their effective
 * lifetime and defeat revocation.
 */
import { prisma } from '@nexora/database';
import type { Request, RequestHandler } from 'express';
import type { Logger } from '@nexora/logger';
import { asyncH } from './async';
import { AppError, ERROR_CODES } from './errors';

const DISCORD_USERS_ME = 'https://discord.com/api/v10/users/@me';

export interface DiscordUserContext {
  /** Discord user id (validated against the User table). */
  userId: string;
  username: string;
}

interface DiscordUser {
  id: string;
  username: string;
  bot?: boolean;
}

/** Extract the bearer token from a request, or null. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer ([A-Za-z0-9._-]{16,512})$/.exec(header);
  return match ? match[1] : null;
}

/**
 * Validate a Discord access token and resolve the platform user.
 * Throws 401 for missing/invalid/expired tokens, 404 when the Discord user has
 * no platform account (never used the bot).
 */
export async function resolveDiscordUser(token: string, logger: Logger): Promise<DiscordUserContext> {
  let discordUser: DiscordUser;
  try {
    const res = await fetch(DISCORD_USERS_ME, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Discord access token is invalid or expired', 401);
    }
    if (!res.ok) {
      throw new AppError(
        'DISCORD_UPSTREAM_ERROR',
        `Discord /users/@me returned ${res.status}`,
        502,
        { status: res.status },
      );
    }
    discordUser = (await res.json()) as DiscordUser;
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.warn({ err: String(err) }, 'Discord /users/@me request failed');
    throw new AppError('DISCORD_UPSTREAM_ERROR', 'Could not validate token with Discord', 502);
  }

  if (!/^\d{15,21}$/.test(discordUser.id) || discordUser.bot) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Token does not belong to a valid user account', 401);
  }

  const user = await prisma.user.findUnique({ where: { id: discordUser.id }, select: { id: true } });
  if (!user) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'No platform account for this Discord user', 404);
  }

  return { userId: discordUser.id, username: discordUser.username };
}

/**
 * Middleware: authenticate with a Discord access token and attach the user
 * context to the request via `getDiscordUser(req)`.
 */
export function discordTokenAuth(logger: Logger): RequestHandler {
  return asyncH(async (req, _res, next) => {
    const token = bearerToken(req);
    if (!token || token.startsWith('nxk_')) {
      throw new AppError(
        ERROR_CODES.UNAUTHORIZED,
        "Missing or malformed Authorization header (expected 'Bearer <discord access token>')",
        401,
      );
    }
    req.discordUser = await resolveDiscordUser(token, req.log ?? logger);
    next();
  });
}

/** Get the Discord-authenticated user context, or throw 401/500. */
export function getDiscordUser(req: Request): DiscordUserContext {
  if (!req.discordUser) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Discord token authentication required', 401);
  }
  return req.discordUser;
}
