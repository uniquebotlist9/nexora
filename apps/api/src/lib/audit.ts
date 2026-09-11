import { prisma, type Prisma } from '@nexora/database';
import { getEnv } from '@nexora/config';
import type { Request } from 'express';
import { hmacSha256Hex } from './crypto';
import type { ApiKeyContext } from '../auth/api-key';

export interface AuditEntry {
  action: string;
  guildId?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Record an audit log entry for an API mutation. The actor is always the API
 * key's owner (actorType 'API'). Client IPs are stored only as an HMAC digest
 * (pseudonymised) so audit rows never contain raw IP addresses.
 *
 * Audit failures are logged but never fail the request — audit is
 * observability, not a transactional side effect.
 */
export async function auditApiCall(req: Request, key: ApiKeyContext, entry: AuditEntry): Promise<void> {
  try {
    const encryptionKey = getEnv().ENCRYPTION_KEY;
    const ipHash =
      encryptionKey && req.ip ? hmacSha256Hex(encryptionKey, req.ip) : null;

    await prisma.auditLog.create({
      data: {
        actorType: 'API',
        actorId: key.userId,
        guildId: entry.guildId ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
        ipHash,
      },
    });
  } catch (err) {
    req.log.error({ err, action: entry.action }, 'Failed to write audit log entry');
  }
}
