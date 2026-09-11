import { prisma, type ScheduledTask } from '@nexora/database';
import { safeJsonParse, toJson } from '../core/utils';

/**
 * ScheduledTask enqueue helpers. The scheduler loop (services/scheduler.ts)
 * claims and executes these; producers only create/cancel rows.
 */
export interface ScheduleTaskInput {
  guildId: string;
  kind: string;
  payload: Record<string, unknown>;
  runAt: Date;
}

export async function scheduleTask(input: ScheduleTaskInput): Promise<ScheduledTask> {
  return prisma.scheduledTask.create({
    data: {
      guildId: input.guildId,
      kind: input.kind,
      payload: toJson(input.payload),
      runAt: input.runAt,
    },
  });
}

/**
 * Cancel pending tasks of a kind whose payload contains `payloadKey: equals`.
 * The MongoDB connector has no JSON path filters, so matching happens in JS.
 */
export async function cancelScheduledTasks(
  guildId: string,
  kind: string,
  payloadKey: string,
  equals: string,
): Promise<number> {
  const tasks = await prisma.scheduledTask.findMany({
    where: { guildId, kind, completedAt: null },
    select: { id: true, payload: true },
    take: 500,
  });
  const ids = tasks
    .filter((task) => {
      const payload = safeJsonParse<Record<string, unknown>>(task.payload) ?? {};
      return payload[payloadKey] === equals;
    })
    .map((task) => task.id);
  if (ids.length === 0) return 0;
  const result = await prisma.scheduledTask.deleteMany({ where: { id: { in: ids } } });
  return result.count;
}

/** Release locks from a previous process (called at startup by the scheduler owner). */
export async function clearStaleLocks(): Promise<number> {
  const result = await prisma.scheduledTask.updateMany({
    where: { lockedAt: { not: null }, completedAt: null },
    data: { lockedAt: null },
  });
  return result.count;
}
