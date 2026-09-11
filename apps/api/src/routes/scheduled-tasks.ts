/**
 * Scheduled task queue endpoints (/v1/scheduled-tasks).
 *
 * These are for the bot process / admin panel backend (internal HMAC auth) —
 * NOT for regular API keys: task payloads can span guilds and the actions
 * mutate shared queue state.
 *
 * The bot claims due tasks by setting `lockedAt`; these endpoints expose the
 * queue (list), an explicit re-queue (retry) and an explicit completion mark
 * for tasks the bot cannot resolve on its own (e.g. cancelled giveaways).
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import { snowflakeSchema } from '@nexora/validation';
import type { RequestHandler } from 'express';
import { asyncH } from '../lib/async';
import { internalGuard } from '../auth/internal';
import { parse, paginated, parsePagination, offset } from '../lib/http';
import { AppError, ERROR_CODES } from '../lib/errors';

/** ScheduledTask.kind values (plain strings in MongoDB — no Prisma enums). */
const SCHEDULED_TASK_KINDS = ['AUTOMATION', 'BACKUP', 'GIVEAWAY_END', 'REMINDER', 'TICKET_INACTIVITY'] as const;

const taskIdParamSchema = z.object({ id: z.string().min(1).max(64) });

const listQuerySchema = z
  .object({
    kind: z.enum(SCHEDULED_TASK_KINDS).optional(),
    guildId: snowflakeSchema.optional(),
    /** Only tasks whose runAt is in the past (default: true). */
    due: z.coerce.boolean().default(true),
    /** Include tasks that already failed (default: false). */
    includeFailed: z.coerce.boolean().default(false),
  })
  .strict();

/**
 * GET /v1/scheduled-tasks — pending tasks, oldest runAt first.
 */
const listRoute: RequestHandler = asyncH(async (req, res) => {
  const { page, pageSize } = parsePagination(req.query);
  const { kind, guildId, due, includeFailed } = parse(listQuerySchema, req.query, 'query');
  const now = new Date();

  const where = {
    completedAt: null,
    ...(includeFailed ? {} : { failedAt: null }),
    ...(kind ? { kind } : {}),
    ...(guildId ? { guildId } : {}),
    ...(due ? { runAt: { lte: now } } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.scheduledTask.count({ where }),
    prisma.scheduledTask.findMany({
      where,
      orderBy: { runAt: 'asc' },
      skip: offset({ page, pageSize }),
      take: pageSize,
      select: {
        id: true,
        guildId: true,
        kind: true,
        payload: true,
        runAt: true,
        lockedAt: true,
        attempts: true,
        failedAt: true,
        error: true,
        createdAt: true,
      },
    }),
  ]);

  res.json(paginated(items, total, page, pageSize));
});

/**
 * POST /v1/scheduled-tasks/:id/retry — re-queue a task: clear the lock, the
 * failure marker and the attempt counter, and make it due immediately.
 */
const retryRoute: RequestHandler = asyncH(async (req, res) => {
  const { id } = parse(taskIdParamSchema, req.params, 'params');

  const task = await prisma.scheduledTask.findUnique({ where: { id } });
  if (!task) throw new AppError(ERROR_CODES.NOT_FOUND, 'Scheduled task not found', 404);
  if (task.completedAt) {
    throw new AppError(ERROR_CODES.CONFLICT, 'Scheduled task is already completed', 409);
  }

  const updated = await prisma.scheduledTask.update({
    where: { id },
    data: {
      lockedAt: null,
      failedAt: null,
      error: null,
      attempts: 0,
      runAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorType: 'SYSTEM',
      actorId: null,
      guildId: task.guildId,
      action: 'internal.scheduledTask.retry',
      targetType: 'ScheduledTask',
      targetId: id,
      metadata: { kind: task.kind, previousAttempts: task.attempts },
    },
  });

  res.json({ task: updated });
});

/**
 * POST /v1/scheduled-tasks/:id/complete — mark a task completed without
 * running it (used when the underlying action became moot, e.g. a cancelled
 * giveaway).
 */
const completeRoute: RequestHandler = asyncH(async (req, res) => {
  const { id } = parse(taskIdParamSchema, req.params, 'params');

  const task = await prisma.scheduledTask.findUnique({ where: { id } });
  if (!task) throw new AppError(ERROR_CODES.NOT_FOUND, 'Scheduled task not found', 404);
  if (task.completedAt) {
    throw new AppError(ERROR_CODES.CONFLICT, 'Scheduled task is already completed', 409);
  }

  const updated = await prisma.scheduledTask.update({
    where: { id },
    data: { completedAt: new Date(), lockedAt: null, error: null },
  });

  await prisma.auditLog.create({
    data: {
      actorType: 'SYSTEM',
      actorId: null,
      guildId: task.guildId,
      action: 'internal.scheduledTask.complete',
      targetType: 'ScheduledTask',
      targetId: id,
      metadata: { kind: task.kind, attempts: task.attempts },
    },
  });

  res.json({ task: updated });
});

export function scheduledTasksRouter(): Router {
  const router = Router();
  router.use(internalGuard());
  router.get('/', listRoute);
  router.post('/:id/retry', retryRoute);
  router.post('/:id/complete', completeRoute);
  return router;
}
