/**
 * Webhook delivery core, shared by the background worker (worker/webhooks.ts)
 * and the POST .../webhooks/:id/test endpoint.
 *
 * Delivery contract (documented for consumers):
 *   POST <endpoint.url>
 *   Content-Type: application/json
 *   X-Nexora-Event:      <event name>
 *   X-Nexora-Delivery:   <delivery id>
 *   X-Nexora-Timestamp:  <unix seconds>
 *   X-Nexora-Signature:  sha256=<hex>
 *     where hex = HMAC-SHA256(endpointSecret, `${timestamp}.${rawBody}`)
 *
 * Consumers should verify the signature and reject timestamps older than a few
 * minutes to prevent replay attacks.
 */
import { getEnv } from '@nexora/config';
import type { WebhookDelivery, WebhookEndpoint } from '@nexora/database';
import type { WebhookPayload } from '@nexora/types';
import { decryptSecret, signWebhookDelivery } from './crypto';

/** Exponential backoff schedule after a failed attempt (5 attempts total). */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000] as const;
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;
export const DELIVERY_TIMEOUT_MS = 10_000;

export interface DeliveryResult {
  ok: boolean;
  statusCode: number | null;
  responseMs: number;
  error?: string;
}

/** Resolve the signing secret for an endpoint (decrypt or legacy plaintext). */
export function endpointSecret(endpoint: Pick<WebhookEndpoint, 'secret'>): string | null {
  const encryptionKey = getEnv().ENCRYPTION_KEY;
  if (endpoint.secret.startsWith('v1:')) {
    return encryptionKey ? decryptSecret(encryptionKey, endpoint.secret) : null;
  }
  // Legacy plaintext row (created before envelope encryption was introduced).
  return endpoint.secret;
}

/**
 * POST a signed payload to the endpoint URL. Never throws — failures are
 * returned as `{ ok: false, error }` so the caller can schedule a retry.
 */
export async function deliver(
  endpoint: Pick<WebhookEndpoint, 'url' | 'secret'>,
  deliveryId: string,
  payload: WebhookPayload,
): Promise<DeliveryResult> {
  const secret = endpointSecret(endpoint);
  if (!secret) {
    return { ok: false, statusCode: null, responseMs: 0, error: 'Signing secret unavailable (ENCRYPTION_KEY changed?)' };
  }

  const rawBody = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhookDelivery(secret, timestamp, rawBody);

  const startedAt = Date.now();
  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Nexora-Webhooks/1.0',
        'X-Nexora-Event': payload.event,
        'X-Nexora-Delivery': deliveryId,
        'X-Nexora-Timestamp': String(timestamp),
        'X-Nexora-Signature': `sha256=${signature}`,
      },
      body: rawBody,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    // Drain the body so the socket is reusable.
    await res.arrayBuffer().catch(() => undefined);
    return { ok: res.ok, statusCode: res.status, responseMs: Date.now() - startedAt };
  } catch (err) {
    return {
      ok: false,
      statusCode: null,
      responseMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Build the WebhookPayload envelope for a delivery row (payload is the `data` field). */
export function toWebhookPayload(delivery: WebhookDelivery, guildId: string): WebhookPayload {
  return {
    id: delivery.id,
    event: delivery.event as WebhookPayload['event'],
    guildId,
    createdAt: delivery.createdAt.toISOString(),
    data: delivery.payload,
  };
}
