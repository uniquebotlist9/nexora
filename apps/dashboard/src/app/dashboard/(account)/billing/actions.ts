'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import { getSession } from '@/lib/guild';
import { ok, err, type ActionResult } from '@/lib/result';

const idSchema = z.object({ subscriptionId: z.string().min(1).max(64) });

/**
 * Schedule (or undo) cancellation at period end for one of the caller's own
 * subscriptions. The plan stays fully active until `currentPeriodEnd`; the
 * provider webhook / subscription sync flips the status when it actually ends.
 */
export async function setCancelAtPeriodEnd(
  subscriptionId: string,
  cancel: boolean,
): Promise<ActionResult> {
  const session = await getSession();
  if (!session?.user?.id) return err('Your session has expired — please sign in again.');

  const parsed = idSchema.safeParse({ subscriptionId });
  if (!parsed.success) return err('Invalid subscription reference.');

  try {
    // Ownership check: users may only touch their own subscriptions.
    const sub = await prisma.subscription.findFirst({
      where: { id: subscriptionId, userId: session.user.id },
      select: { id: true, plan: true, cancelAtPeriodEnd: true },
    });
    if (!sub) return err('Subscription not found.');
    if (sub.cancelAtPeriodEnd === cancel) return ok(); // idempotent no-op

    await prisma.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: cancel },
    });

    await prisma.auditLog.create({
      data: {
        actorType: 'USER',
        actorId: session.user.id,
        action: cancel ? 'billing.cancel_scheduled' : 'billing.resumed',
        targetType: 'SUBSCRIPTION',
        targetId: sub.id,
        metadata: { plan: sub.plan } as never,
      },
    });

    revalidatePath('/dashboard/billing');
    return ok();
  } catch {
    return err('Could not update the subscription. Please try again.');
  }
}
