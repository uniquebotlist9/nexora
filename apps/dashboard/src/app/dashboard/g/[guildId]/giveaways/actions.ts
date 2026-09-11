'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@nexora/database';
import { giveawayCreateInputSchema } from '@nexora/validation';
import { assertGuildAccess } from '@/lib/guild';
import { ok, err, zodFieldErrors, type ActionResult } from '@/lib/result';

export interface GiveawayCreateInput {
  channelId: string;
  prize: string;
  description?: string;
  winnerCount: number;
  durationMinutes: number;
  requiredRoleId?: string;
  minAccountAgeDays?: number;
  minMessages?: number;
  bonusRoles?: { roleId: string; extraEntries: number }[];
}

/**
 * Create a giveaway. The message is posted and the end scheduled by the bot:
 * we create the Giveaway row plus a ScheduledTask (kind GIVEAWAY_END) whose
 * worker posts the giveaway embed and draws winners at `endsAt`.
 */
export async function createGiveaway(guildId: string, input: GiveawayCreateInput): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;

  const parsed = giveawayCreateInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid giveaway configuration', zodFieldErrors(parsed.error));

  try {
    const endsAt = new Date(Date.now() + parsed.data.durationMinutes * 60_000);
    await prisma.$transaction(async (tx) => {
      const giveaway = await tx.giveaway.create({
        data: {
          guildId,
          channelId: parsed.data.channelId,
          prize: parsed.data.prize,
          description: parsed.data.description,
          winnerCount: parsed.data.winnerCount,
          requiredRoleId: parsed.data.requiredRoleId,
          minAccountAgeDays: parsed.data.minAccountAgeDays,
          minMessages: parsed.data.minMessages,
          bonusRoles: parsed.data.bonusRoles ?? [],
          status: 'RUNNING',
          endsAt,
        },
      });
      // BOT HANDOFF: scheduler claims this task and posts the giveaway message,
      // then re-schedules the draw at endsAt.
      await tx.scheduledTask.create({
        data: {
          guildId,
          kind: 'GIVEAWAY_START',
          payload: { giveawayId: giveaway.id },
          runAt: new Date(),
        },
      });
    });
    await prisma.auditLog.create({
      data: { actorType: 'USER', guildId, action: 'giveaways.created', targetType: 'GIVEAWAY', targetId: input.prize },
    });
    revalidatePath(`/dashboard/g/${guildId}/giveaways`);
    return ok();
  } catch {
    return err('Could not create the giveaway.');
  }
}

/** End a running giveaway early (bot draws winners via the task queue). */
export async function endGiveaway(guildId: string, giveawayId: string): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;
  try {
    const updated = await prisma.giveaway.updateMany({
      where: { id: giveawayId, guildId, status: 'RUNNING' },
      data: { status: 'ENDED', endedAt: new Date(), endsAt: new Date() },
    });
    if (updated.count === 0) return err('Giveaway not found or already ended.');
    await prisma.scheduledTask.create({
      data: { guildId, kind: 'GIVEAWAY_END', payload: { giveawayId }, runAt: new Date() },
    });
    revalidatePath(`/dashboard/g/${guildId}/giveaways`);
    return ok();
  } catch {
    return err('Could not end the giveaway.');
  }
}

/** Reroll winners for an ended giveaway. */
export async function rerollGiveaway(guildId: string, giveawayId: string): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;
  try {
    const giveaway = await prisma.giveaway.findFirst({ where: { id: giveawayId, guildId } });
    if (!giveaway) return err('Giveaway not found.');
    if (giveaway.status !== 'ENDED') return err('Only ended giveaways can be rerolled.');
    await prisma.giveaway.update({
      where: { id: giveawayId },
      data: { rerollCount: { increment: 1 } },
    });
    await prisma.scheduledTask.create({
      data: { guildId, kind: 'GIVEAWAY_REROLL', payload: { giveawayId }, runAt: new Date() },
    });
    revalidatePath(`/dashboard/g/${guildId}/giveaways`);
    return ok();
  } catch {
    return err('Could not reroll the giveaway.');
  }
}
