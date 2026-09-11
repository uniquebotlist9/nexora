'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@nexora/database';
import { writeAudit } from '@/lib/audit';
import { guardAction } from '@/lib/actions/guard';
import type { ActionResult } from '@/lib/types';
import { firstIssue, recordIdSchema } from '@/lib/validation';

/**
 * Requeue a failed webhook delivery: status → PENDING, nextRetryAt → null.
 * DEVELOPER and above.
 */
export async function requeueWebhookDeliveryAction(
  deliveryId: string,
): Promise<ActionResult> {
  const g = await guardAction({ minRank: 'DEVELOPER' });
  if ('error' in g) return { ok: false, error: g.error };

  const parsed = recordIdSchema.safeParse(deliveryId);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    const delivery = await prisma.webhookDelivery.findUnique({
      where: { id: parsed.data },
      select: { id: true, status: true, event: true, endpointId: true },
    });
    if (!delivery) return { ok: false, error: 'Delivery not found.' };
    if (delivery.status !== 'FAILED' && delivery.status !== 'RETRYING') {
      return { ok: false, error: 'Only failed or retrying deliveries can be requeued.' };
    }

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: 'PENDING', nextRetryAt: null },
    });

    await writeAudit(g.session.user.id, {
      action: 'admin.system.requeueWebhook',
      targetType: 'WebhookDelivery',
      targetId: delivery.id,
      metadata: {
        event: delivery.event,
        endpointId: delivery.endpointId,
        from: delivery.status,
      },
    });

    revalidatePath('/admin/system');
    revalidatePath('/admin');
    return { ok: true, message: 'Delivery requeued.' };
  } catch {
    return { ok: false, error: 'Failed to requeue delivery.' };
  }
}

/**
 * Disable a webhook endpoint (soft delete, status → DISABLED — matches the
 * API's own soft-delete semantics). DEVELOPER and above.
 */
export async function disableWebhookEndpointAction(
  endpointId: string,
): Promise<ActionResult> {
  const g = await guardAction({ minRank: 'DEVELOPER' });
  if ('error' in g) return { ok: false, error: g.error };

  const parsed = recordIdSchema.safeParse(endpointId);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    const endpoint = await prisma.webhookEndpoint.findUnique({
      where: { id: parsed.data },
      select: { id: true, name: true, status: true, guildId: true },
    });
    if (!endpoint) return { ok: false, error: 'Endpoint not found.' };
    if (endpoint.status === 'DISABLED') {
      return { ok: false, error: 'Endpoint is already disabled.' };
    }

    await prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: { status: 'DISABLED' },
    });

    await writeAudit(g.session.user.id, {
      action: 'admin.system.disableWebhookEndpoint',
      guildId: endpoint.guildId,
      targetType: 'WebhookEndpoint',
      targetId: endpoint.id,
      metadata: { name: endpoint.name, from: endpoint.status },
    });

    revalidatePath('/admin/system');
    revalidatePath('/admin');
    return { ok: true, message: 'Endpoint disabled.' };
  } catch {
    return { ok: false, error: 'Failed to disable endpoint.' };
  }
}

/**
 * Force-complete a stuck scheduled task (completedAt → now, clears failure
 * state). Destructive: DEVELOPER and above, confirm dialog in the UI.
 */
export async function forceCompleteScheduledTaskAction(
  taskId: string,
): Promise<ActionResult> {
  const g = await guardAction({ minRank: 'DEVELOPER' });
  if ('error' in g) return { ok: false, error: g.error };

  const parsed = recordIdSchema.safeParse(taskId);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    const task = await prisma.scheduledTask.findUnique({
      where: { id: parsed.data },
      select: { id: true, kind: true, completedAt: true, guildId: true },
    });
    if (!task) return { ok: false, error: 'Task not found.' };
    if (task.completedAt) {
      return { ok: false, error: 'Task is already completed.' };
    }

    await prisma.scheduledTask.update({
      where: { id: task.id },
      data: {
        completedAt: new Date(),
        failedAt: null,
        error: null,
        lockedAt: null,
      },
    });

    await writeAudit(g.session.user.id, {
      action: 'admin.system.forceCompleteTask',
      guildId: task.guildId,
      targetType: 'ScheduledTask',
      targetId: task.id,
      metadata: { kind: task.kind },
    });

    revalidatePath('/admin/system');
    revalidatePath('/admin');
    return { ok: true, message: 'Task force-completed.' };
  } catch {
    return { ok: false, error: 'Failed to force-complete task.' };
  }
}
