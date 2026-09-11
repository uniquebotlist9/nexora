'use server';

import { revalidatePath } from 'next/cache';
import { addDays } from 'date-fns';
import { prisma } from '@nexora/database';
import { writeAudit } from '@/lib/audit';
import { guardAction } from '@/lib/actions/guard';
import { GUILD_DANGER_ROLES, SUBSCRIPTION_MUTATION_ROLES } from '@/lib/roles';
import type { ActionResult } from '@/lib/types';
import {
  durationDaysSchema,
  firstIssue,
  guildNoteSchema,
  premiumPlanSchema,
  snowflakeSchema,
} from '@/lib/validation';

const ACTIVE_STATUSES = ['ACTIVE', 'TRIALING'] as const;

/**
 * Disable / re-enable a guild (toggles Guild.active).
 * Danger zone: OWNER / ADMINISTRATOR only.
 */
export async function toggleGuildActiveAction(guildId: string): Promise<ActionResult> {
  const g = await guardAction({ roles: GUILD_DANGER_ROLES });
  if ('error' in g) return { ok: false, error: g.error };

  const parsedId = snowflakeSchema.safeParse(guildId);
  if (!parsedId.success) return { ok: false, error: firstIssue(parsedId.error) };

  try {
    const guild = await prisma.guild.findUnique({
      where: { id: parsedId.data },
      select: { id: true, active: true },
    });
    if (!guild) return { ok: false, error: 'Guild not found.' };

    const updated = await prisma.guild.update({
      where: { id: guild.id },
      data: { active: !guild.active },
      select: { active: true },
    });

    await writeAudit(g.session.user.id, {
      action: 'admin.guild.toggleActive',
      guildId: guild.id,
      targetType: 'Guild',
      targetId: guild.id,
      metadata: { from: guild.active, to: updated.active },
    });

    revalidatePath('/admin/guilds');
    revalidatePath(`/admin/guilds/${guild.id}`);
    revalidatePath('/admin');
    return {
      ok: true,
      message: updated.active ? 'Guild re-enabled.' : 'Guild disabled.',
    };
  } catch {
    return { ok: false, error: 'Failed to update guild status.' };
  }
}

/** Grant (or upgrade) premium on a guild. SUPPORT and above (subscription mutations). */
export async function grantGuildPremiumAction(
  guildId: string,
  plan: string,
  days: number,
): Promise<ActionResult> {
  const g = await guardAction({ roles: SUBSCRIPTION_MUTATION_ROLES });
  if ('error' in g) return { ok: false, error: g.error };

  const parsedId = snowflakeSchema.safeParse(guildId);
  const parsedPlan = premiumPlanSchema.safeParse(plan);
  const parsedDays = durationDaysSchema.safeParse(days);
  if (!parsedId.success) return { ok: false, error: firstIssue(parsedId.error) };
  if (!parsedPlan.success) return { ok: false, error: firstIssue(parsedPlan.error) };
  if (!parsedDays.success) return { ok: false, error: firstIssue(parsedDays.error) };

  try {
    const guild = await prisma.guild.findUnique({
      where: { id: parsedId.data },
      select: { id: true },
    });
    if (!guild) return { ok: false, error: 'Guild not found.' };

    const existing = await prisma.subscription.findFirst({
      where: { guildId: guild.id, provider: 'internal', status: { in: [...ACTIVE_STATUSES] } },
      orderBy: { createdAt: 'desc' },
    });
    const periodEnd = addDays(new Date(), parsedDays.data);

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
        status: { in: [...ACTIVE_STATUSES] },
      },
      data: { status: 'CANCELLED' },
    });

    await writeAudit(g.session.user.id, {
      action: 'admin.guild.grantPremium',
      guildId: guild.id,
      targetType: 'Subscription',
      targetId: subscription.id,
      metadata: { plan: parsedPlan.data, days: parsedDays.data, created: !existing, collapsed },
    });

    revalidatePath('/admin/guilds');
    revalidatePath(`/admin/guilds/${guild.id}`);
    revalidatePath('/admin/subscriptions');
    revalidatePath('/admin');
    return { ok: true, message: `${parsedPlan.data} granted for ${parsedDays.data} days.` };
  } catch {
    return { ok: false, error: 'Failed to grant premium.' };
  }
}

/** Revoke the guild's active subscription. SUPPORT and above. */
export async function revokeGuildPremiumAction(guildId: string): Promise<ActionResult> {
  const g = await guardAction({ roles: SUBSCRIPTION_MUTATION_ROLES });
  if ('error' in g) return { ok: false, error: g.error };

  const parsedId = snowflakeSchema.safeParse(guildId);
  if (!parsedId.success) return { ok: false, error: firstIssue(parsedId.error) };

  try {
    const subscription = await prisma.subscription.findFirst({
      where: { guildId: parsedId.data, status: { in: [...ACTIVE_STATUSES] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) {
      return { ok: false, error: 'Guild has no active subscription.' };
    }

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'CANCELLED', cancelAtPeriodEnd: false },
    });

    await writeAudit(g.session.user.id, {
      action: 'admin.guild.revokePremium',
      guildId: subscription.guildId,
      targetType: 'Subscription',
      targetId: subscription.id,
      metadata: { plan: subscription.plan },
    });

    revalidatePath('/admin/guilds');
    revalidatePath(`/admin/guilds/${parsedId.data}`);
    revalidatePath('/admin/subscriptions');
    revalidatePath('/admin');
    return { ok: true, message: 'Premium revoked.' };
  } catch {
    return { ok: false, error: 'Failed to revoke premium.' };
  }
}

/** Add an internal staff note to a guild (stored as an audit entry). SUPPORT+. */
export async function addGuildNoteAction(
  guildId: string,
  note: string,
): Promise<ActionResult> {
  const g = await guardAction({ minRank: 'SUPPORT' });
  if ('error' in g) return { ok: false, error: g.error };

  const parsedId = snowflakeSchema.safeParse(guildId);
  const parsedNote = guildNoteSchema.safeParse(note);
  if (!parsedId.success) return { ok: false, error: firstIssue(parsedId.error) };
  if (!parsedNote.success) return { ok: false, error: firstIssue(parsedNote.error) };

  try {
    const guild = await prisma.guild.findUnique({
      where: { id: parsedId.data },
      select: { id: true },
    });
    if (!guild) return { ok: false, error: 'Guild not found.' };

    await writeAudit(g.session.user.id, {
      action: 'admin.guild.note',
      guildId: guild.id,
      targetType: 'Guild',
      targetId: guild.id,
      metadata: { note: parsedNote.data },
    });

    revalidatePath(`/admin/guilds/${guild.id}`);
    return { ok: true, message: 'Note added.' };
  } catch {
    return { ok: false, error: 'Failed to add note.' };
  }
}
