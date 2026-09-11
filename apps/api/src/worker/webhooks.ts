/**
 * Webhook delivery worker.
 *
 * Polls every ~10s for due WebhookDelivery rows (PENDING, or RETRYING with
 * nextRetryAt <= now) and delivers them with limited concurrency (5).
 *
 * Multi-instance safety: deliveries are claimed optimistically before sending —
 * a delivery only proceeds when its status transition PENDING|RETRYING ->
 * DELIVERING succeeds (updateMany acts as a compare-and-swap on status), so two
 * API instances never double-send the same delivery. DELIVERING is a
 * transitional in-flight state; rows stuck in it (crashed instance) are
 * re-claimable after a stall window.
 */
import type { Logger } from '@nexora/logger';
import { prisma } from '@nexora/database';
import type { WebhookDelivery, WebhookEndpoint } from '@nexora/database';
import {
  deliver,
  endpointSecret,
  MAX_ATTEMPTS,
  RETRY_DELAYS_MS,
  toWebhookPayload,
} from '../lib/webhook-delivery';

const POLL_INTERVAL_MS = 10_000;
const CONCURRENCY = 5;
/** Re-claim deliveries stuck in DELIVERING after 5 minutes (crashed worker). */
const STALL_WINDOW_MS = 5 * 60_000;

export interface WebhookWorker {
  /** Run a single poll cycle (also used by tests / manual triggering). */
  tick(): Promise<{ claimed: number }>;
  stop(): void;
  readonly running: boolean;
}

export function startWebhookWorker(logger: Logger): WebhookWorker {
  const log = logger.child({ component: 'webhook-worker' });
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let ticking = false;

  async function tick(): Promise<{ claimed: number }> {
    const due = await findDueDeliveries();
    if (due.length === 0) return { claimed: 0 };

    // Process with limited concurrency.
    let claimed = 0;
    let index = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, due.length) }, async () => {
      while (!stopped && index < due.length) {
        const delivery = due[index++];
        if (await claimDelivery(delivery.id)) {
          claimed++;
          await processDelivery(delivery.id).catch((err: unknown) => {
            log.error({ err: String(err), deliveryId: delivery.id }, 'webhook delivery crashed');
          });
        }
      }
    });
    await Promise.all(workers);
    return { claimed };
  }

  function loop(): void {
    if (stopped) return;
    timer = setTimeout(() => {
      if (ticking || stopped) {
        loop();
        return;
      }
      ticking = true;
      tick()
        .catch((err: unknown) => {
          log.error({ err: String(err) }, 'webhook worker poll failed');
        })
        .finally(() => {
          ticking = false;
          loop();
        });
    }, POLL_INTERVAL_MS);
    timer.unref?.();
  }

  loop();
  log.info({ intervalMs: POLL_INTERVAL_MS, concurrency: CONCURRENCY }, 'webhook delivery worker started');

  return {
    tick,
    get running(): boolean {
      return !stopped;
    },
    stop(): void {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      log.info('webhook delivery worker stopped');
    },
  };
}

/** Deliveries ready to be attempted right now. */
async function findDueDeliveries(): Promise<WebhookDelivery[]> {
  const now = new Date();
  return prisma.webhookDelivery.findMany({
    where: {
      OR: [
        { status: 'PENDING' },
        { status: 'RETRYING', nextRetryAt: { lte: now } },
        // Recover rows stuck in DELIVERING by a crashed instance: nextRetryAt
        // doubles as the claim lease expiry while a row is DELIVERING.
        { status: 'DELIVERING', nextRetryAt: { lte: now } },
      ],
      endpoint: { status: { in: ['PENDING', 'ACTIVE'] } },
    },
    orderBy: { createdAt: 'asc' },
    take: 25,
  });
}

/**
 * Optimistically claim a delivery: only one instance wins the CAS on status.
 * The claim also sets a lease (nextRetryAt = now + STALL_WINDOW) so a row left
 * in DELIVERING by a crashed instance becomes re-claimable once the lease
 * expires — the same field doubles as the retry-due time for RETRYING rows.
 */
async function claimDelivery(deliveryId: string): Promise<boolean> {
  const claimed = await prisma.webhookDelivery.updateMany({
    where: {
      id: deliveryId,
      status: { in: ['PENDING', 'RETRYING', 'DELIVERING'] },
    },
    data: {
      status: 'DELIVERING',
      nextRetryAt: new Date(Date.now() + STALL_WINDOW_MS),
    },
  });
  return claimed.count > 0;
}

/** Deliver one claimed delivery and record the outcome (success, retry or terminal failure). */
async function processDelivery(deliveryId: string): Promise<void> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true },
  });
  if (!delivery || delivery.status !== 'DELIVERING') return;

  const endpoint = delivery.endpoint as WebhookEndpoint;
  const payload = toWebhookPayload(delivery, endpoint.guildId);
  const result = await deliver(endpoint, delivery.id, payload);

  if (result.ok) {
    await prisma.$transaction([
      prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
          statusCode: result.statusCode,
          responseMs: result.responseMs,
        },
      }),
      prisma.webhookEndpoint.update({
        where: { id: endpoint.id },
        data: { lastDeliveryAt: new Date(), lastStatusCode: result.statusCode },
      }),
    ]);
    return;
  }

  // Failure: schedule a retry with exponential backoff, or fail terminally.
  const attempts = delivery.attempts + 1;
  const terminal = attempts >= MAX_ATTEMPTS;

  const updates: Parameters<typeof prisma.webhookEndpoint.update>[0]['data'] = {
    failureCount: { increment: 1 },
  };
  if (terminal) {
    // Disable the endpoint after the final failed attempt — a persistently
    // unreachable consumer should not generate endless traffic.
    updates.status = 'DISABLED';
  } else if (endpoint.status === 'PENDING') {
    updates.status = 'ACTIVE';
  }

  await prisma.$transaction([
    prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: terminal ? 'FAILED' : 'RETRYING',
        attempts,
        statusCode: result.statusCode,
        responseMs: result.responseMs,
        nextRetryAt: terminal ? null : new Date(Date.now() + RETRY_DELAYS_MS[attempts - 1]),
      },
    }),
    prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: updates }),
  ]);
}
