'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@nexora/database';
import { writeAudit } from '@/lib/audit';
import { guardAction } from '@/lib/actions/guard';
import { SYSTEM_OPS_ROLES } from '@/lib/roles';
import type { ActionResult } from '@/lib/types';
import { firstIssue, recordIdSchema } from '@/lib/validation';

/**
 * Revoke a user's API key (sets revokedAt; irreversible). DEVELOPER and above.
 */
export async function revokeApiKeyAction(apiKeyId: string): Promise<ActionResult> {
  const g = await guardAction({ roles: SYSTEM_OPS_ROLES });
  if ('error' in g) return { ok: false, error: g.error };

  const parsed = recordIdSchema.safeParse(apiKeyId);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    const apiKey = await prisma.apiKey.findUnique({
      where: { id: parsed.data },
      select: { id: true, name: true, prefix: true, revokedAt: true, userId: true },
    });
    if (!apiKey) return { ok: false, error: 'API key not found.' };
    if (apiKey.revokedAt) return { ok: false, error: 'API key is already revoked.' };

    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { revokedAt: new Date() },
    });

    await writeAudit(g.session.user.id, {
      action: 'admin.user.revokeApiKey',
      targetType: 'ApiKey',
      targetId: apiKey.id,
      metadata: { name: apiKey.name, prefix: apiKey.prefix, userId: apiKey.userId },
    });

    revalidatePath(`/admin/users/${apiKey.userId}`);
    return { ok: true, message: 'API key revoked.' };
  } catch {
    return { ok: false, error: 'Failed to revoke API key.' };
  }
}
