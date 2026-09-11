import { Router } from 'express';
import { z } from 'zod';
import type { RequestHandler } from 'express';
import { asyncH } from '../lib/async';
import { getProvider } from '../payments/provider';
import { processPaymentEvent } from '../payments/process';
import { parse } from '../lib/http';
import { AppError, ERROR_CODES } from '../lib/errors';

const providerParamSchema = z.object({ provider: z.enum(['stripe']) });

/**
 * POST /v1/payments/webhook/:provider — provider-to-platform webhook.
 *
 * Verifies the provider signature over the RAW request body (captured by
 * express.json's verify hook — signatures are computed over exact bytes, so
 * re-serialized JSON would never match), then upserts a PaymentEvent
 * (idempotent on provider+eventId) and updates Subscription rows.
 *
 * No API key auth: callers are payment providers authenticating via their own
 * signature scheme. Global IP rate limiting still applies.
 *
 * If STRIPE_SECRET_KEY (or STRIPE_WEBHOOK_SECRET) is not configured the route
 * returns 503 with a clear message instead of accepting unverifiable traffic.
 */
export function paymentsRouter(): Router {
  const router = Router();

  const webhookRoute: RequestHandler = asyncH(async (req, res) => {
    const { provider: providerName } = parse(providerParamSchema, req.params, 'params');

    const provider = getProvider(providerName);
    if (!provider) {
      throw new AppError(
        'PAYMENTS_NOT_CONFIGURED',
        `Payments are not configured: ${providerName.toUpperCase()} credentials are missing (set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET)`,
        503,
      );
    }

    const event = await provider.handleWebhook(req);
    const result = await processPaymentEvent(provider, event);

    // Always 200 on duplicates: payment providers retry until they get a 2xx.
    res.status(200).json({
      received: true,
      provider: providerName,
      type: event.kind,
      duplicate: result.duplicate,
    });
  });

  router.post('/webhook/:provider', webhookRoute);
  return router;
}
