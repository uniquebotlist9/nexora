'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@nexora/database';
import { writeAudit } from '@/lib/audit';
import { guardAction } from '@/lib/actions/guard';
import type { ActionResult } from '@/lib/types';
import { firstIssue, recordIdSchema } from '@/lib/validation';

/** Feedback triage: delete an abusive / junk feedback entry. SUPPORT and above. */
export async function deleteFeedbackAction(feedbackId: string): Promise<ActionResult> {
  const g = await guardAction({ roles: ['OWNER', 'ADMINISTRATOR', 'SUPPORT'] });
  if ('error' in g) return { ok: false, error: g.error };

  const parsed = recordIdSchema.safeParse(feedbackId);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    const feedback = await prisma.feedback.findUnique({
      where: { id: parsed.data },
      select: { id: true, rating: true, userId: true, guildId: true },
    });
    if (!feedback) return { ok: false, error: 'Feedback not found.' };

    await prisma.feedback.delete({ where: { id: feedback.id } });

    await writeAudit(g.session.user.id, {
      action: 'admin.feedback.delete',
      guildId: feedback.guildId,
      targetType: 'Feedback',
      targetId: feedback.id,
      metadata: { rating: feedback.rating, userId: feedback.userId },
    });

    revalidatePath('/admin/feedback');
    revalidatePath('/admin');
    return { ok: true, message: 'Feedback deleted.' };
  } catch {
    return { ok: false, error: 'Failed to delete feedback.' };
  }
}
