/**
 * Payment provider abstraction.
 *
 * Providers implement createCheckout / handleWebhook / cancel. Implementations:
 *  - StripeProvider: talks to the Stripe REST API via fetch() (no SDK, no
 *    hardcoded credentials — reads STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET
 *    from the environment).
 *  - InternalProvider: manual plan grants performed by platform admins in the
 *    admin panel; no external payment flow, used for comped/support grants.
 *
 * There is deliberately no provider registry beyond these two: adding a
 * provider means implementing this interface and mounting it in
 * getProvider().
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { PlanTier } from '@nexora/types';
import { getEnv } from '@nexora/config';
import { AppError, ERROR_CODES } from '../lib/errors';

export interface CheckoutInput {
  /** Discord user id of the purchaser. */
  userId: string;
  /** Guild the subscription applies to (null = user-level premium). */
  guildId: string | null;
  plan: PlanTier;
  /** Price lookup key / amount is resolved by the provider configuration. */
  priceId?: string;
}

export interface CheckoutSession {
  provider: string;
  /** URL the customer should be redirected to (null for internal grants). */
  url: string | null;
  /** Provider-side reference for the session/subscription. */
  reference: string;
}

export type NormalizedPaymentEvent =
  | { kind: 'subscription.activated'; provider: string; eventId: string; userId: string; guildId: string | null; plan: PlanTier; providerRef: string; currentPeriodEnd: Date | null }
  | { kind: 'subscription.updated'; provider: string; eventId: string; userId: string; guildId: string | null; plan: PlanTier; providerRef: string; currentPeriodEnd: Date | null }
  | { kind: 'subscription.cancelled'; provider: string; eventId: string; userId: string; providerRef: string }
  | { kind: 'payment.succeeded'; provider: string; eventId: string; userId: string; amountCents: number; currency: string; providerRef: string | null }
  | { kind: 'unhandled'; provider: string; eventId: string; type: string };

export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  /**
   * Verify the provider's signature on the raw request and return a
   * normalized event. Throws AppError(401/400) on invalid signatures.
   */
  handleWebhook(req: Request): Promise<NormalizedPaymentEvent>;
  cancel(subscriptionRef: string): Promise<void>;
}

// ============================================================================
// Stripe (REST API via fetch — no SDK dependency)
// ============================================================================

const STRIPE_API = 'https://api.stripe.com/v1';

export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe';

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
  ) {}

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const body = new URLSearchParams({
      mode: 'subscription',
      'metadata[userId]': input.userId,
      'metadata[guildId]': input.guildId ?? '',
      'metadata[plan]': input.plan,
      'success_url': `${getEnv().DASHBOARD_URL}/billing/success`,
      'cancel_url': `${getEnv().DASHBOARD_URL}/billing/cancel`,
    });
    if (input.priceId) body.set('line_items[0][price]', input.priceId);
    if (input.priceId) body.set('line_items[0][quantity]', '1');

    const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new AppError('PAYMENT_PROVIDER_ERROR', `Stripe checkout session creation failed (${res.status})`, 502, {
        status: res.status,
        body: text.slice(0, 500),
      });
    }
    const session = (await res.json()) as { id: string; url: string | null };
    return { provider: this.name, url: session.url, reference: session.id };
  }

  async handleWebhook(req: Request): Promise<NormalizedPaymentEvent> {
    const signature = headerValue(req, 'stripe-signature');
    const rawBody = req.rawBody;
    if (!signature || !rawBody) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Missing Stripe signature header or raw body', 401);
    }
    if (!verifyStripeSignature(rawBody, signature, this.webhookSecret)) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Invalid Stripe webhook signature', 401);
    }

    const event = JSON.parse(rawBody.toString('utf8')) as {
      id: string;
      type: string;
      data: { object: Record<string, unknown> };
    };

    const object = event.data?.object ?? {};
    const metadata = (object.metadata as Record<string, string> | undefined) ?? {};
    const userId = metadata.userId ?? '';
    const guildId = metadata.guildId || null;
    const plan = (metadata.plan as PlanTier | undefined) ?? undefined;
    const providerRef =
      typeof object.subscription === 'string'
        ? object.subscription
        : typeof object.id === 'string'
          ? object.id
          : null;

    switch (event.type) {
      case 'checkout.session.completed':
      case 'customer.subscription.created':
        return {
          kind: 'subscription.activated',
          provider: this.name,
          eventId: event.id,
          userId,
          guildId,
          plan: plan ?? 'FREE',
          providerRef: providerRef ?? '',
          currentPeriodEnd: numberToDate(object.current_period_end),
        };
      case 'customer.subscription.updated':
        return {
          kind: 'subscription.updated',
          provider: this.name,
          eventId: event.id,
          userId,
          guildId,
          plan: plan ?? 'FREE',
          providerRef: providerRef ?? '',
          currentPeriodEnd: numberToDate(object.current_period_end),
        };
      case 'customer.subscription.deleted':
        return {
          kind: 'subscription.cancelled',
          provider: this.name,
          eventId: event.id,
          userId,
          providerRef: providerRef ?? '',
        };
      case 'invoice.payment_succeeded':
      case 'invoice.paid':
        return {
          kind: 'payment.succeeded',
          provider: this.name,
          eventId: event.id,
          userId,
          amountCents: typeof object.amount_paid === 'number' ? object.amount_paid : 0,
          currency: typeof object.currency === 'string' ? object.currency : 'usd',
          providerRef: providerRef,
        };
      default:
        return { kind: 'unhandled', provider: this.name, eventId: event.id, type: event.type };
    }
  }

  async cancel(subscriptionRef: string): Promise<void> {
    const res = await fetch(`${STRIPE_API}/subscriptions/${encodeURIComponent(subscriptionRef)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.secretKey}` },
    });
    if (!res.ok && res.status !== 404) {
      throw new AppError('PAYMENT_PROVIDER_ERROR', `Stripe subscription cancellation failed (${res.status})`, 502);
    }
  }
}

/**
 * Stripe signs webhooks as `t=<unix>,v1=<hmac>` where
 * hmac = HMAC-SHA256(webhookSecret, `${t}.${rawBody}`).
 */
function verifyStripeSignature(rawBody: Buffer, signatureHeader: string, secret: string): boolean {
  const parts = signatureHeader.split(',').reduce<Record<string, string[]>>((acc, part) => {
    const [k, v] = part.split('=', 2);
    if (k && v) (acc[k] ??= []).push(v);
    return acc;
  }, {});
  const timestamp = parts.t?.[0];
  const signatures = parts.v1 ?? [];
  if (!timestamp || signatures.length === 0) return false;

  // Reject events older than 5 minutes to blunt replay attacks.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return signatures.some((sig) => {
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

// ============================================================================
// Internal (manual admin grants)
// ============================================================================

export class InternalProvider implements PaymentProvider {
  readonly name = 'internal';

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    // Internal grants have no checkout flow — the admin panel performs the
    // grant directly. This method exists so callers can treat providers
    // uniformly; it returns a non-actionable session.
    return { provider: this.name, url: null, reference: `internal:${input.userId}:${input.plan}` };
  }

  async handleWebhook(req: Request): Promise<NormalizedPaymentEvent> {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      'The internal provider does not deliver webhooks; plans are granted manually in the admin panel',
      400,
    );
  }

  async cancel(subscriptionRef: string): Promise<void> {
    // Nothing to cancel at an external provider; Subscription rows are updated
    // directly by the admin panel.
    void subscriptionRef;
  }
}

/** Resolve the payment provider by name. Returns null when unknown/unavailable. */
export function getProvider(name: string): PaymentProvider | null {
  if (name === 'internal') return new InternalProvider();
  if (name === 'stripe') {
    const env = getEnv();
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) return null;
    return new StripeProvider(env.STRIPE_SECRET_KEY, env.STRIPE_WEBHOOK_SECRET);
  }
  return null;
}

function headerValue(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function numberToDate(value: unknown): Date | null {
  return typeof value === 'number' ? new Date(value * 1000) : null;
}
