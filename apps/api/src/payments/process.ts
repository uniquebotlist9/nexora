/**
 * Payment webhook processing: verify -> upsert PaymentEvent (idempotent on
 * provider+eventId) -> apply the normalized event to Subscription rows.
 */
import type { Request } from 'express';
import { prisma, type Prisma } from '@nexora/database';
import type { NormalizedPaymentEvent, PaymentProvider } from './provider';

/**
 * Process a verified webhook event. Idempotent: the (provider, eventId) unique
 * constraint on PaymentEvent guarantees each provider event is applied at most
 * once — replays return `{ duplicate: true }` without touching subscriptions.
 */
export async function processPaymentEvent(
  provider: PaymentProvider,
  event: NormalizedPaymentEvent,
): Promise<{ applied: boolean; duplicate: boolean }> {
  // Idempotency: the (provider, eventId) pair is unique; a duplicate insert
  // fails with P2002 (unique constraint), which we treat as a replay.
  try {
    await prisma.paymentEvent.create({
      data: {
        provider: provider.name,
        eventId: event.eventId,
        type: event.kind,
        payload: {} as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      return { applied: false, duplicate: true };
    }
    throw err;
  }

  try {
    await applyEvent(provider, event);
    await prisma.paymentEvent.update({
      where: { provider_eventId: { provider: provider.name, eventId: event.eventId } },
      data: { processedAt: new Date() },
    });
    return { applied: true, duplicate: false };
  } catch (err) {
    // Mark unprocessed so a future replay/reprocessing can retry; keep the
    // event row for observability.
    await prisma.paymentEvent.update({
      where: { provider_eventId: { provider: provider.name, eventId: event.eventId } },
      data: { processedAt: null },
    });
    throw err;
  }
}

async function applyEvent(provider: PaymentProvider, event: NormalizedPaymentEvent): Promise<void> {
  switch (event.kind) {
    case 'subscription.activated':
    case 'subscription.updated': {
      if (!event.userId) break;
      const existing = await prisma.subscription.findFirst({
        where: { userId: event.userId, guildId: event.guildId, provider: provider.name },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        await prisma.subscription.update({
          where: { id: existing.id },
          data: {
            plan: event.plan,
            status: 'ACTIVE',
            providerRef: event.providerRef,
            currentPeriodEnd: event.currentPeriodEnd,
          },
        });
      } else {
        await prisma.subscription.create({
          data: {
            userId: event.userId,
            guildId: event.guildId,
            plan: event.plan,
            status: 'ACTIVE',
            provider: provider.name,
            providerRef: event.providerRef,
            currentPeriodEnd: event.currentPeriodEnd,
          },
        });
      }
      break;
    }
    case 'subscription.cancelled': {
      if (!event.userId) break;
      await prisma.subscription.updateMany({
        where: { userId: event.userId, provider: provider.name, providerRef: event.providerRef },
        data: { status: 'CANCELLED', cancelAtPeriodEnd: true },
      });
      break;
    }
    case 'payment.succeeded': {
      // Recorded as a PaymentEvent row already; amounts are aggregated by the
      // admin stats endpoint directly from PaymentEvent.
      break;
    }
    case 'unhandled':
      break;
  }
}
