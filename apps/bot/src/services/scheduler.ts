import { prisma, type ScheduledTask } from '@nexora/database';
import { serializeError } from '@nexora/logger';
import { getContext } from '../core/context';
import { safeJsonParse, toJson } from '../core/utils';
import { clearStaleLocks, scheduleTask } from './task-queue';
import { endGiveaway } from './giveaways';
import { handleTicketInactivity } from './tickets';
import { runScheduledAutomation } from './automations';
import { handleVerificationTimeout } from './verification';
import { createBackup } from './backups';
import { closeActiveCases } from './moderation';
import { logModeration } from './logging';

const TICK_INTERVAL_MS = 15_000;
const STALE_LOCK_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;

type TaskHandler = (task: ScheduledTask) => Promise<void>;

/** Handler table for every ScheduledTask kind the bot produces. */
const HANDLERS: Record<string, TaskHandler> = {
  GIVEAWAY_END: async (task) => {
    const payload = safeJsonParse<{ giveawayId?: string }>(task.payload) ?? {};
    if (payload.giveawayId) await endGiveaway(payload.giveawayId);
  },
  REMINDER: async (task) => {
    const payload = safeJsonParse<{ reminderId?: string }>(task.payload) ?? {};
    if (!payload.reminderId) return;
    const reminder = await prisma.reminder.findUnique({ where: { id: payload.reminderId } });
    if (!reminder || reminder.delivered) return;
    await prisma.reminder.update({ where: { id: reminder.id }, data: { delivered: true } });
    const { client } = getContext();
    const text: string = `⏰ **Reminder:** ${reminder.content}`;
    if (reminder.channelId) {
      const channel = await client.channels.fetch(reminder.channelId).catch(() => null);
      if (channel?.isSendable()) {
        await channel.send({ content: `<@${reminder.userId}> ${text}` });
        return;
      }
    }
    const user = await client.users.fetch(reminder.userId).catch(() => null);
    if (user) await user.send({ content: text }).catch(() => undefined);
  },
  TICKET_INACTIVITY: async (task) => {
    const payload = safeJsonParse<{ ticketId?: string }>(task.payload) ?? {};
    if (payload.ticketId) await handleTicketInactivity(task.guildId, payload.ticketId);
  },
  AUTOMATION: async (task) => {
    await runScheduledAutomation(task);
  },
  TEMPBAN_EXPIRE: async (task) => {
    const payload = safeJsonParse<{ targetUserId?: string; caseNumber?: number }>(task.payload) ?? {};
    if (!payload.targetUserId) return;
    const { client } = getContext();
    const guild = await client.guilds.fetch(task.guildId).catch(() => null);
    if (!guild) return;
    await guild.members.unban(payload.targetUserId, 'Temporary ban expired').catch(() => undefined);
    await closeActiveCases(task.guildId, payload.targetUserId, ['BAN', 'TEMPBAN']);
    if (payload.caseNumber) {
      await prisma.moderationCase
        .update({
          where: { guildId_caseNumber: { guildId: task.guildId, caseNumber: payload.caseNumber } },
          data: { active: false, resolvedAt: new Date() },
        })
        .catch(() => undefined);
    }
    await logModeration(guild, {
      action: `Temporary ban expired for <@${payload.targetUserId}>`,
      targetId: payload.targetUserId,
      title: 'Tempban expired',
    }).catch(() => undefined);
  },
  BACKUP_SCHEDULED: async (task) => {
    const payload = safeJsonParse<{ name?: string }>(task.payload) ?? {};
    const { client } = getContext();
    const guild = await client.guilds.fetch(task.guildId).catch(() => null);
    if (!guild) return;
    // Rotate: stay within the plan's backup limit by dropping the oldest first.
    const result = await createBackup(guild, client.user?.id ?? '0', payload.name ?? 'Scheduled backup', true);
    if (!result.ok) {
      const oldest = await prisma.backup.findFirst({
        where: { guildId: task.guildId, scheduled: true },
        orderBy: { createdAt: 'asc' },
      });
      if (oldest) {
        await prisma.backup.delete({ where: { id: oldest.id } });
        await createBackup(guild, client.user?.id ?? '0', payload.name ?? 'Scheduled backup', true);
      }
    }
  },
  VERIFICATION_TIMEOUT: async (task) => {
    const payload = safeJsonParse<{ userId?: string }>(task.payload) ?? {};
    if (payload.userId) await handleVerificationTimeout(task.guildId, payload.userId);
  },
  POLL_END: async (task) => {
    const payload = safeJsonParse<{ channelId?: string; messageId?: string; question?: string; optionCount?: number }>(task.payload) ?? {};
    if (!payload.channelId || !payload.messageId) return;
    const { client } = getContext();
    const channel = await client.channels.fetch(payload.channelId).catch(() => null);
    if (!channel?.isTextBased()) return;
    const message = await channel.messages.fetch(payload.messageId).catch(() => null);
    if (!message) return;
    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const counts = numberEmojis.slice(0, payload.optionCount ?? 0).map((emoji, index) => ({
      option: index + 1,
      count: message.reactions.cache.get(emoji)?.count ?? 0,
    }));
    const winner = counts.reduce((best, entry) => (entry.count > best.count ? entry : best), counts[0] ?? { option: 0, count: 0 });
    await message
      .reply({
        content:
          counts.length > 0 && winner.count > 0
            ? `📊 **Poll closed** — option **#${winner.option}** won with **${winner.count}** votes!`
            : '📊 **Poll closed** — no votes were cast.',
      })
      .catch(() => undefined);
  },
};

let timer: NodeJS.Timeout | null = null;
let ticking = false;

/** Claim + execute one task with optimistic locking and retry/backoff. */
async function processTask(task: ScheduledTask, staleBefore: Date): Promise<void> {
  const { log } = getContext();
  const claim = await prisma.scheduledTask.updateMany({
    where: {
      id: task.id,
      completedAt: null,
      AND: [{ OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }] }],
    },
    data: { lockedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claim.count !== 1) return; // another worker won the race

  const handler = HANDLERS[task.kind];
  try {
    if (!handler) {
      log.warn({ taskId: task.id, kind: task.kind }, 'No handler for scheduled task kind');
    } else {
      await handler(task);
    }
    await prisma.scheduledTask.update({ where: { id: task.id }, data: { completedAt: new Date() } });
  } catch (err) {
    const attempts = task.attempts + 1;
    log.error({ err: serializeError(err), taskId: task.id, kind: task.kind, attempts }, 'Scheduled task failed');
    if (attempts >= MAX_ATTEMPTS) {
      await prisma.scheduledTask
        .update({
          where: { id: task.id },
          data: {
            completedAt: new Date(),
            failedAt: new Date(),
            error: String((err as Error)?.message ?? err).slice(0, 500),
          },
        })
        .catch(() => undefined);
    } else {
      const backoffMs = Math.min(attempts * 60_000, 15 * 60_000);
      await prisma.scheduledTask
        .update({
          where: { id: task.id },
          data: {
            lockedAt: null,
            runAt: new Date(Date.now() + backoffMs),
            error: String((err as Error)?.message ?? err).slice(0, 500),
          },
        })
        .catch(() => undefined);
    }
  }
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_LOCK_MS);
    const candidates = await prisma.scheduledTask.findMany({
      where: {
        completedAt: null,
        runAt: { lte: now },
        OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
      },
      orderBy: { runAt: 'asc' },
      take: 10,
    });
    for (const task of candidates) {
      await processTask(task, staleBefore);
    }
  } catch (err) {
    getContext().log.error({ err: serializeError(err) }, 'Scheduler tick failed');
  } finally {
    ticking = false;
  }
}

/** Release locks from a previous process so pending tasks resume immediately. */
export async function resumePendingTasks(): Promise<void> {
  const released = await clearStaleLocks().catch(() => 0);
  if (released > 0) {
    getContext().log.info({ released }, 'Resumed pending scheduled tasks');
  }
  // Re-arm overdue giveaways that were missed while offline.
  const overdue = await prisma.giveaway.findMany({
    where: { status: 'RUNNING', endsAt: { lt: new Date() } },
    select: { id: true, guildId: true },
    take: 50,
  });
  for (const giveaway of overdue) {
    const pending = await prisma.scheduledTask.findFirst({
      where: {
        guildId: giveaway.guildId,
        kind: 'GIVEAWAY_END',
        completedAt: null,
        payload: { equals: toJson({ giveawayId: giveaway.id }) },
      },
      select: { id: true },
    });
    if (!pending) {
      await scheduleTask({
        guildId: giveaway.guildId,
        kind: 'GIVEAWAY_END',
        payload: { giveawayId: giveaway.id },
        runAt: new Date(),
      });
    } else {
      await prisma.scheduledTask
        .updateMany({ where: { id: pending.id }, data: { runAt: new Date(), lockedAt: null } })
        .catch(() => undefined);
    }
  }
}

/** Start the 15s scheduler loop (only on the primary worker/shard). */
export function startScheduler(): void {
  if (timer) return;
  const { log } = getContext();
  log.info('Scheduler started (15s interval)');
  timer = setInterval(() => {
    void tick();
  }, TICK_INTERVAL_MS);
  // Don't hold the process open just for the scheduler.
  timer.unref?.();
  void tick();
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    getContext().log.info('Scheduler stopped');
  }
}
