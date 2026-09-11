'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@nexora/database';
import { assertGuildAccess } from '@/lib/guild';
import { ok, err, type ActionResult } from '@/lib/result';

/**
 * Request a backup. BOT HANDOFF: creates a ScheduledTask (kind BACKUP);
 * the bot's scheduler snapshots the guild configuration into Backup.data
 * (size, checksum included) and marks the task completed.
 */
export async function createBackup(guildId: string): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;

  try {
    await prisma.scheduledTask.create({
      data: { guildId, kind: 'BACKUP', payload: { trigger: 'MANUAL' }, runAt: new Date() },
    });
    await prisma.auditLog.create({
      data: { actorType: 'USER', guildId, action: 'backups.create_requested', targetType: 'BACKUP' },
    });
    revalidatePath(`/dashboard/g/${guildId}/backups`);
    return ok();
  } catch {
    return err('Could not queue the backup.');
  }
}

export async function deleteBackup(guildId: string, backupId: string): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;
  try {
    await prisma.backup.deleteMany({ where: { id: backupId, guildId } });
    revalidatePath(`/dashboard/g/${guildId}/backups`);
    return ok();
  } catch {
    return err('Could not delete the backup.');
  }
}

/**
 * Restore a backup. BOT HANDOFF: enqueue ScheduledTask (kind BACKUP_RESTORE)
 * referencing the backup; the scheduler applies the snapshot to guild config.
 */
export async function restoreBackup(guildId: string, backupId: string): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;

  const backup = await prisma.backup.findFirst({ where: { id: backupId, guildId } });
  if (!backup) return err('Backup not found.');

  try {
    await prisma.scheduledTask.create({
      data: { guildId, kind: 'BACKUP_RESTORE', payload: { backupId }, runAt: new Date() },
    });
    await prisma.auditLog.create({
      data: { actorType: 'USER', guildId, action: 'backups.restore_requested', targetType: 'BACKUP', targetId: backupId },
    });
    revalidatePath(`/dashboard/g/${guildId}/backups`);
    return ok();
  } catch {
    return err('Could not queue the restore.');
  }
}

/** Enable or disable scheduled (weekly) backups. */
export async function setScheduledBackups(guildId: string, scheduled: boolean): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;
  try {
    await prisma.backup.updateMany({ where: { guildId }, data: { scheduled } });
    revalidatePath(`/dashboard/g/${guildId}/backups`);
    return ok();
  } catch {
    return err('Could not update scheduled backups.');
  }
}
