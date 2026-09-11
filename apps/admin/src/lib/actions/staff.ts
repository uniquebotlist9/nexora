'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@nexora/database';
import { writeAudit } from '@/lib/audit';
import { guardAction } from '@/lib/actions/guard';
import { STAFF_MUTATION_ROLES } from '@/lib/roles';
import type { ActionResult } from '@/lib/types';
import { firstIssue, recordIdSchema, snowflakeSchema, staffRoleSchema } from '@/lib/validation';

/** Add a staff member (Discord user ID + role). OWNER only. */
export async function addStaffAction(userId: string, role: string): Promise<ActionResult> {
  const g = await guardAction({ roles: STAFF_MUTATION_ROLES });
  if ('error' in g) return { ok: false, error: g.error };

  const parsedId = snowflakeSchema.safeParse(userId);
  const parsedRole = staffRoleSchema.safeParse(role);
  if (!parsedId.success) return { ok: false, error: firstIssue(parsedId.error) };
  if (!parsedRole.success) return { ok: false, error: firstIssue(parsedRole.error) };

  try {
    const existing = await prisma.adminUser.findUnique({
      where: { userId: parsedId.data },
      select: { id: true },
    });
    if (existing) return { ok: false, error: 'This user is already staff.' };

    const created = await prisma.adminUser.create({
      data: { userId: parsedId.data, role: parsedRole.data },
    });

    await writeAudit(g.session.user.id, {
      action: 'admin.staff.add',
      targetType: 'AdminUser',
      targetId: created.userId,
      metadata: { role: created.role },
    });

    revalidatePath('/admin/staff');
    return { ok: true, message: 'Staff member added.' };
  } catch {
    return { ok: false, error: 'Failed to add staff member.' };
  }
}

/** Change a staff member's role. OWNER only; protects the last OWNER. */
export async function changeStaffRoleAction(
  adminUserId: string,
  role: string,
): Promise<ActionResult> {
  const g = await guardAction({ roles: STAFF_MUTATION_ROLES });
  if ('error' in g) return { ok: false, error: g.error };

  const parsedId = recordIdSchema.safeParse(adminUserId);
  const parsedRole = staffRoleSchema.safeParse(role);
  if (!parsedId.success) return { ok: false, error: firstIssue(parsedId.error) };
  if (!parsedRole.success) return { ok: false, error: firstIssue(parsedRole.error) };

  try {
    const staff = await prisma.adminUser.findUnique({ where: { id: parsedId.data } });
    if (!staff) return { ok: false, error: 'Staff member not found.' };
    if (staff.role === parsedRole.data) {
      return { ok: false, error: 'Staff member already has this role.' };
    }

    if (staff.role === 'OWNER' && parsedRole.data !== 'OWNER') {
      const owners = await prisma.adminUser.count({ where: { role: 'OWNER' } });
      if (owners <= 1) {
        return { ok: false, error: 'Cannot demote the last OWNER.' };
      }
    }

    await prisma.adminUser.update({
      where: { id: staff.id },
      data: { role: parsedRole.data },
    });

    await writeAudit(g.session.user.id, {
      action: 'admin.staff.role',
      targetType: 'AdminUser',
      targetId: staff.userId,
      metadata: { from: staff.role, to: parsedRole.data },
    });

    revalidatePath('/admin/staff');
    return { ok: true, message: 'Role updated.' };
  } catch {
    return { ok: false, error: 'Failed to change role.' };
  }
}

/** Remove a staff member. OWNER only; self-removal and last-OWNER protected. */
export async function removeStaffAction(adminUserId: string): Promise<ActionResult> {
  const g = await guardAction({ roles: STAFF_MUTATION_ROLES });
  if ('error' in g) return { ok: false, error: g.error };

  const parsedId = recordIdSchema.safeParse(adminUserId);
  if (!parsedId.success) return { ok: false, error: firstIssue(parsedId.error) };

  try {
    const staff = await prisma.adminUser.findUnique({ where: { id: parsedId.data } });
    if (!staff) return { ok: false, error: 'Staff member not found.' };
    if (staff.userId === g.session.user.id) {
      return { ok: false, error: 'You cannot remove your own staff account.' };
    }
    if (staff.role === 'OWNER') {
      const owners = await prisma.adminUser.count({ where: { role: 'OWNER' } });
      if (owners <= 1) {
        return { ok: false, error: 'Cannot remove the last OWNER.' };
      }
    }

    await prisma.adminUser.delete({ where: { id: staff.id } });

    await writeAudit(g.session.user.id, {
      action: 'admin.staff.remove',
      targetType: 'AdminUser',
      targetId: staff.userId,
      metadata: { role: staff.role },
    });

    revalidatePath('/admin/staff');
    return { ok: true, message: 'Staff member removed.' };
  } catch {
    return { ok: false, error: 'Failed to remove staff member.' };
  }
}
