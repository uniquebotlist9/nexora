import { prisma, type Prisma } from '@nexora/database';
import { serializeError } from '@nexora/logger';
import type { WebhookEvent } from '@nexora/types';
import { getContext } from '../core/context';
import { newId, toJson } from '../core/utils';

/**
 * Outgoing webhook fan-out. The bot only enqueues WebhookDelivery rows for
 * every matching registered endpoint of the guild; signing and HTTP delivery
 * (with retries) is owned by the API worker.
 */
export async function enqueueWebhookEvent(
  guildId: string,
  event: WebhookEvent,
  data: unknown,
): Promise<void> {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { guildId, events: { has: event }, status: { in: ['PENDING', 'RETRYING'] } },
      select: { id: true },
    });
    if (endpoints.length === 0) return;

    const payload = {
      id: newId(),
      event,
      guildId,
      createdAt: new Date().toISOString(),
      data,
    };

    await prisma.webhookDelivery.createMany({
      data: endpoints.map((endpoint) => ({
        endpointId: endpoint.id,
        event,
        payload: toJson(payload) as Prisma.InputJsonValue,
      })),
    });
  } catch (err) {
    getContext().log.warn({ err: serializeError(err), guildId, event }, 'Failed to enqueue webhook event');
  }
}
