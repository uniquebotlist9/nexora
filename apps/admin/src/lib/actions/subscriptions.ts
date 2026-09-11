'use server';

import { revalidatePath } from 'next/cache';
import { addDays } from 'date-fns';
import { prisma } from '@nexora/database';
import { writeAudit } from '@/lib/audit';
import { guardAction } from '@/lib/actions/guard';
import { SUBSCRIPTION_MUTATION_ROLES } from '@/lib/roles';
import type { ActionResult } from '@/lib/types';
import {
  durationDaysSchema,
  firstIssue,
  planSchema,
  recordIdSchema,
  snowflakeSchema,
} from '@/lib/validation';

export interface GrantPlanInput {
  targetType: 'guild' | 'user';
  targetId: string;
  plan: string;
  days: number;
}

/**
 * Manual plan grant: creates or updates an `internal` Subscription for a guild
 * or a user. OWNER / ADMINISTRATOR / SUPPORT.
 */
export async function grantSubscriptionPlanAction(
  input: GrantPlanInput,
): Promise<ActionResult> {
  const g = await guardAction({ roles: SUBSCRIPTION_MUTATION_ROLES });
  if ('error' in g) return { ok: false, error: g.error };

  const parsedTarget = snowflakeSchema.safeParse(input.targetId);
  const parsedPlan = planSchema.safeParse(input.plan);
  const parsedDays = durationDaysSchema.safeParse(input.days);
  if (!parsedTarget.success) return { ok: false, error: firstIssue(parsedTarget.error) };
  if (!parsedPlan.success) return { ok: false, error: firstIssue(parsedPlan.error) };
  if (!parsedDays.success) return { ok: false, error: firstIssue(parsedDays.error) };
  if (input.targetType !== 'guild' && input.targetType !== 'user') {
    return { ok: false, error: 'Invalid target type.' };
  }

  const periodEnd = addDays(new Date(), parsedDays.data);

  try {
    if (input.targetType === 'guild') {
      const guild = await prisma.guild.findUnique({
        where: { id: parsedTarget.data },
        select: { id: true },
      });
      if (!guild) return { ok: false, error: 'Guild not found.' };

      const existing = await prisma.subscription.findFirst({
        where: { guildId: guild.id, provider: 'internal', status: { in: ['ACTIVE', 'TRIALING'] } },
        orderBy: { createdAt: 'desc' },
      });
      const subscription = existing
        ? await prisma.subscription.update({
            where: { id: existing.id },
            data: {
              plan: parsedPlan.data,
              status: 'ACTIVE',
              provider: 'internal',
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: false,
            },
          })
        : await prisma.subscription.create({
            data: {
              guildId: guild.id,
              userId: g.session.user.id,
              plan: parsedPlan.data,
              status: 'ACTIVE',
              provider: 'internal',
              currentPeriodEnd: periodEnd,
            },
          });

      // Leave exactly one active internal subscription on the guild —
      // cancel stale duplicates so plan resolution stays unambiguous.
      const { count: collapsed } = await prisma.subscription.updateMany({
        where: {
          guildId: guild.id,
          provider: 'internal',
          id: { not: subscription.id },
          status: { in: ['ACTIVE', 'TRIALING'] },
        },
        data: { status: 'CANCELLED' },
      });

      await writeAudit(g.session.user.id, {
        action: 'admin.subscription.grant',
        guildId: guild.id,
        targetType: 'Subscription',
        targetId: subscription.id,
        metadata: {
          targetType: 'guild',
          plan: parsedPlan.data,
          days: parsedDays.data,
          created: !existing,
          collapsed,
        },
      });
    } else {
      const user = await prisma.user.findUnique({
        where: { id: parsedTarget.data },
        select: { id: true },
      });
      if (!user) return { ok: false, error: 'User not found.' };

      const existing = await prisma.subscription.findFirst({
        where: {
          userId: user.id,
          guildId: null,
          provider: 'internal',
          status: { in: ['ACTIVE', 'TRIALING'] },
        },
        orderBy: { createdAt: 'desc' },
      });
      const subscription = existing
        ? await prisma.subscription.update({
            where: { id: existing.id },
            data: {
              plan: parsedPlan.data,
              status: 'ACTIVE',
              provider: 'internal',
              currentPeriodEnd: periodEnd,
              cancelAtPeriodEnd: false,
            },
          })
        : await prisma.subscription.create({
            data: {
              userId: user.id,
              // Persist explicit null — Mongo omits the field otherwise and
              // `guildId: null` filters never match it (Prisma null ≠ missing).
              guildId: null,
              plan: parsedPlan.data,
              status: 'ACTIVE',
              provider: 'internal',
              currentPeriodEnd: periodEnd,
            },
          });

      // Leave exactly one active internal personal subscription per user —
      // cancel stale duplicates so plan resolution stays unambiguous.
      const { count: collapsed } = await prisma.subscription.updateMany({
        where: {
          userId: user.id,
          guildId: null,
          provider: 'internal',
          id: { not: subscription.id },
          status: { in: ['ACTIVE', 'TRIALING'] },
        },
        data: { status: 'CANCELLED' },
      });

      await writeAudit(g.session.user.id, {
        action: 'admin.subscription.grant',
        targetType: 'Subscription',
        targetId: subscription.id,
        metadata: {
          targetType: 'user',
          plan: parsedPlan.data,
          days: parsedDays.data,
          created: !existing,
          collapsed,
        },
      });
    }

    revalidatePath('/admin/subscriptions');
    revalidatePath('/admin/guilds');
    if (input.targetType === 'user') {
      revalidatePath(`/admin/users/${parsedTarget.data}`);
    }
    revalidatePath('/admin');
    return {
      ok: true,
      message: `${parsedPlan.data} plan granted for ${parsedDays.data} days.`,
    };
  } catch {
    return { ok: false, error: 'Failed to grant plan.' };
  }
}

/**
 * Manually cancel a subscription (status → CANCELLED, stop period-end renewals).
 * OWNER / ADMINISTRATOR / SUPPORT.
 */
export async function cancelSubscriptionAction(
  subscriptionId: string,
): Promise<ActionResult> {
  const g = await guardAction({ roles: SUBSCRIPTION_MUTATION_ROLES });
  if ('error' in g) return { ok: false, error: g.error };

  const parsed = recordIdSchema.safeParse(subscriptionId);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: parsed.data },
      select: { id: true, plan: true, status: true, guildId: true, userId: true },
    });
    if (!subscription) return { ok: false, error: 'Subscription not found.' };
    if (subscription.status === 'CANCELLED' || subscription.status === 'EXPIRED') {
      return { ok: false, error: 'Subscription is already cancelled or expired.' };
    }

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'CANCELLED', cancelAtPeriodEnd: false },
    });

    await writeAudit(g.session.user.id, {
      action: 'admin.subscription.cancel',
      guildId: subscription.guildId,
      targetType: 'Subscription',
      targetId: subscription.id,
      metadata: {
        plan: subscription.plan,
        from: subscription.status,
        userId: subscription.userId,
      },
    });

    revalidatePath('/admin/subscriptions');
    if (subscription.guildId) {
      revalidatePath(`/admin/guilds/${subscription.guildId}`);
    }
    if (subscription.userId) {
      revalidatePath(`/admin/users/${subscription.userId}`);
    }
    revalidatePath('/admin');
    return { ok: true, message: 'Subscription cancelled.' };
  } catch {
    return { ok: false, error: 'Failed to cancel subscription.' };
  }
}
