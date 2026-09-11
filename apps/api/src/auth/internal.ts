/**
 * Internal-service guard for admin-only endpoints (/v1/admin/*).
 *
 * The admin panel's server-side calls authenticate with an HMAC derived from
 * the shared ENCRYPTION_KEY so that admin endpoints are never reachable with
 * plain API keys (admin data spans all guilds, so per-guild API key scopes do
 * not apply).
 *
 *   Header:  X-Nexora-Internal: <hex>
 *   Value:   HMAC-SHA256(ENCRYPTION_KEY, "<UTC date as YYYY-MM-DD>")
 *
 * The current UTC date and the previous/next day are accepted to tolerate
 * clock skew around midnight; the date rotation also limits key reuse windows.
 * The header value changes daily — never log it.
 */
import { getEnv } from '@nexora/config';
import type { RequestHandler } from 'express';
import { hmacSha256Hex, secureEqualHex } from '../lib/crypto';
import { AppError, ERROR_CODES } from '../lib/errors';

export const INTERNAL_HEADER = 'x-nexora-internal';

function utcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Candidate dates: yesterday, today, tomorrow (UTC) to allow skew. */
function expectedTokens(encryptionKey: string): string[] {
  const now = Date.now();
  const dayMs = 86_400_000;
  return [-dayMs, 0, dayMs].map((delta) =>
    hmacSha256Hex(encryptionKey, utcDateString(new Date(now + delta))),
  );
}

/** Verify an X-Nexora-Internal token against the ENCRYPTION_KEY-derived HMAC. */
export function verifyInternalToken(provided: string | undefined): boolean {
  const encryptionKey = getEnv().ENCRYPTION_KEY;
  if (!provided || !encryptionKey) return false;
  return expectedTokens(encryptionKey).some((expected) => secureEqualHex(expected, provided));
}

export function internalGuard(): RequestHandler {
  return (req, _res, next): void => {
    if (!getEnv().ENCRYPTION_KEY) {
      next(
        new AppError(
          'INTERNAL_AUTH_NOT_CONFIGURED',
          'Internal service authentication is not configured: ENCRYPTION_KEY is not set',
          503,
        ),
      );
      return;
    }
    const header = req.headers[INTERNAL_HEADER];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token || !verifyInternalToken(token)) {
      next(new AppError(ERROR_CODES.UNAUTHORIZED, 'Invalid or missing internal service token', 401));
      return;
    }
    next();
  };
}
