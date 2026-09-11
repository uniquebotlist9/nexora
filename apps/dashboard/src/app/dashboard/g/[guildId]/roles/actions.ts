'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@nexora/database';
import { assertGuildAccess } from '@/lib/guild';
import { ok, err, type ActionResult } from '@/lib/result';

/**
 * Toggle a role's staff designation. The bot syncs roles into the Role table;
 * isStaff marks which roles count as server staff (used by tickets etc.).
 */
export async function toggleRoleStaff(guildId: string, roleId: string, isStaff: boolean): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;
  try {
    await prisma.role.updateMany({ where: { id: roleId, guildId }, data: { isStaff } });
    revalidatePath(`/dashboard/g/${guildId}/roles`);
    return ok();
  } catch {
    return err('Could not update the role.');
  }
}
