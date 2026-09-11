import { prisma, type Prisma } from '@nexora/database';

export interface AuditEntry {
  /** Admin action, always prefixed `admin.` (announcements use system.announcement). */
  action: string;
  guildId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Every staff mutation is audit-logged:
 * actorType 'USER', actorId = the admin's Discord id, action prefixed 'admin.'.
 */
export async function writeAudit(
  actorId: string,
  entry: AuditEntry,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorType: 'USER',
      actorId,
      action: entry.action,
      guildId: entry.guildId ?? null,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      metadata: (entry.metadata ?? {}) as unknown as Prisma.InputJsonValue,
    },
  });
}
