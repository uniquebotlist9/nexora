import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma, type Prisma } from '@nexora/database';
import { webhookEndpointInputSchema } from '@nexora/validation';
import { WEBHOOK_EVENTS, WEBHOOK_DELIVERY_STATUSES, isWebhookEvent } from '@nexora/types';
import type { RequestHandler } from 'express';
import { getEnv } from '@nexora/config';
import { asyncH } from '../lib/async';
import { getApiKey, requireScope, SCOPES } from '../auth/api-key';
import { requireGuild } from '../lib/guild-access';
import { auditApiCall } from '../lib/audit';
import { encryptSecret } from '../lib/crypto';
import { deliver } from '../lib/webhook-delivery';
import { parse, paginated, parsePagination, offset } from '../lib/http';
import { AppError, ERROR_CODES } from '../lib/errors';

const idParamSchema = z.object({ id: z.string().min(10).max(64) });

/** Queryable delivery statuses (DELIVERING is the worker's transient claim state). */
const DELIVERY_STATUSES = [...WEBHOOK_DELIVERY_STATUSES, 'DELIVERING'] as const;

const deliveriesQuerySchema = z.object({
  status: z.enum(DELIVERY_STATUSES).optional(),
  event: z.enum(WEBHOOK_EVENTS).optional(),
  endpointId: z.string().min(10).max(64).optional(),
});

/**
 * Validate events against the webhook event catalog (WEBHOOK_EVENTS from
 * @nexora/types). Unknown event names are rejected with a 400.
 */
function parseEvents(events: string[]): string[] {
  const invalid = events.filter((e) => !isWebhookEvent(e));
  if (invalid.length > 0) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      `Unknown webhook event(s): ${invalid.join(', ')}. Valid events: ${WEBHOOK_EVENTS.join(', ')}`,
      400,
    );
  }
  return events;
}

/** Endpoint representation that NEVER includes the secret. */
function redactEndpoint(endpoint: {
  id: string;
  guildId: string;
  name: string;
  url: string;
  events: string[];
  status: string;
  failureCount: number;
  lastDeliveryAt: Date | null;
  lastStatusCode: number | null;
  createdAt: Date;
}): Record<string, unknown> {
  return {
    id: endpoint.id,
    guildId: endpoint.guildId,
    name: endpoint.name,
    url: endpoint.url,
    events: endpoint.events,
    status: endpoint.status,
    failureCount: endpoint.failureCount,
    lastDeliveryAt: endpoint.lastDeliveryAt,
    lastStatusCode: endpoint.lastStatusCode,
    createdAt: endpoint.createdAt,
  };
}

function redactDelivery(delivery: {
  id: string;
  endpointId: string;
  event: string;
  status: string;
  statusCode: number | null;
  responseMs: number | null;
  attempts: number;
  nextRetryAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
}): Record<string, unknown> {
  return {
    id: delivery.id,
    endpointId: delivery.endpointId,
    event: delivery.event,
    status: delivery.status,
    statusCode: delivery.statusCode,
    responseMs: delivery.responseMs,
    attempts: delivery.attempts,
    nextRetryAt: delivery.nextRetryAt,
    deliveredAt: delivery.deliveredAt,
    createdAt: delivery.createdAt,
  };
}

/** Find an endpoint scoped to this guild, or throw 404. */
async function requireEndpoint(id: string, guildId: string) {
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, guildId } });
  if (!endpoint) throw new AppError(ERROR_CODES.NOT_FOUND, 'Webhook endpoint not found', 404);
  return endpoint;
}

/** GET /v1/guilds/:guildId/webhooks */
const listRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const { page, pageSize } = parsePagination(req.query);

  const where: Prisma.WebhookEndpointWhereInput = { guildId: guild.id };
  const [total, items] = await Promise.all([
    prisma.webhookEndpoint.count({ where }),
    prisma.webhookEndpoint.findMany({ where, orderBy: { createdAt: 'desc' }, skip: offset({ page, pageSize }), take: pageSize }),
  ]);

  res.json(paginated(items.map(redactEndpoint), total, page, pageSize));
});

/**
 * POST /v1/guilds/:guildId/webhooks — creates an endpoint, generates a random
 * signing secret and returns the RAW SECRET exactly once. The secret is stored
 * encrypted at rest (AES-256-GCM via ENCRYPTION_KEY); when ENCRYPTION_KEY is
 * not configured it falls back to plaintext storage so local/dev environments
 * keep working (never do this in production).
 */
const createRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  const input = parse(webhookEndpointInputSchema, req.body, 'body');
  const events = parseEvents(input.events);

  const rawSecret = randomBytes(32).toString('hex');
  const encryptionKey = getEnv().ENCRYPTION_KEY;
  const storedSecret = encryptionKey ? encryptSecret(encryptionKey, rawSecret) : rawSecret;

  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      guildId: guild.id,
      ownerId: key.userId,
      name: input.name,
      url: input.url,
      secret: storedSecret,
      events,
      status: 'PENDING',
    },
  });

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.webhook.create',
    targetType: 'WebhookEndpoint',
    targetId: endpoint.id,
    metadata: { name: endpoint.name, events, secretEncrypted: Boolean(encryptionKey) },
  });

  res.status(201).json({
    endpoint: redactEndpoint(endpoint),
    // Shown ONCE. Store it securely — it cannot be retrieved again.
    secret: rawSecret,
  });
});

/** GET /v1/guilds/:guildId/webhooks/deliveries — delivery history with filters. */
const deliveriesRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const { page, pageSize } = parsePagination(req.query);
  const filter = parse(deliveriesQuerySchema, req.query, 'query');

  // Deliveries are scoped via their endpoint's guildId — a caller with staff
  // access to guild A must never see guild B's delivery history.
  const where: Prisma.WebhookDeliveryWhereInput = {
    endpoint: { guildId: guild.id },
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.event ? { event: filter.event } : {}),
    ...(filter.endpointId ? { endpointId: filter.endpointId } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.webhookDelivery.count({ where }),
    prisma.webhookDelivery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset({ page, pageSize }),
      take: pageSize,
    }),
  ]);

  res.json(paginated(items.map(redactDelivery), total, page, pageSize));
});

/**
 * POST /v1/guilds/:guildId/webhooks/:id/test — synchronously deliver a signed
 * test payload to the endpoint and report the outcome. The attempt is recorded
 * as a WebhookDelivery row (event = the endpoint's first subscribed event) so
 * it shows up in the delivery history, but it never goes through the retry
 * queue and does not count toward the endpoint's failure count.
 */
const testRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  const { id } = parse(idParamSchema, req.params, 'params');

  const endpoint = await requireEndpoint(id, guild.id);
  if (endpoint.status === 'DISABLED') {
    throw new AppError(ERROR_CODES.CONFLICT, 'Webhook endpoint is disabled and cannot be tested', 409);
  }

  const testEvent = endpoint.events.find(isWebhookEvent) ?? 'member.join';
  const payload = {
    id: `test_${Date.now()}`,
    event: testEvent,
    guildId: guild.id,
    createdAt: new Date().toISOString(),
    data: {
      test: true,
      endpointId: endpoint.id,
      endpointName: endpoint.name,
      message: 'This is a test delivery from NEXORA. If you can read this, your endpoint is configured correctly.',
    },
  };

  const result = await deliver(endpoint, payload.id, payload);

  const [delivery] = await prisma.$transaction([
    prisma.webhookDelivery.create({
      data: {
        endpointId: endpoint.id,
        event: testEvent,
        payload: payload.data as Prisma.InputJsonValue,
        statusCode: result.statusCode,
        responseMs: result.responseMs,
        attempts: 1,
        status: result.ok ? 'DELIVERED' : 'FAILED',
        deliveredAt: result.ok ? new Date() : null,
      },
    }),
    prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: { lastDeliveryAt: new Date(), lastStatusCode: result.statusCode },
    }),
  ]);

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.webhook.test',
    targetType: 'WebhookEndpoint',
    targetId: endpoint.id,
    metadata: { ok: result.ok, statusCode: result.statusCode, responseMs: result.responseMs },
  });

  res.status(result.ok ? 200 : 502).json({
    ok: result.ok,
    event: testEvent,
    delivery: redactDelivery(delivery),
    ...(result.ok ? {} : { error: result.error }),
  });
});

/** DELETE /v1/guilds/:guildId/webhooks/:id — soft delete (status=DISABLED). */
const deleteRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  const { id } = parse(idParamSchema, req.params, 'params');

  const endpoint = await requireEndpoint(id, guild.id);

  await prisma.webhookEndpoint.update({
    where: { id: endpoint.id },
    data: { status: 'DISABLED' },
  });
  // Cancel any queued deliveries for this endpoint.
  await prisma.webhookDelivery.updateMany({
    where: { endpointId: endpoint.id, status: { in: ['PENDING', 'RETRYING', 'DELIVERING'] } },
    data: { status: 'FAILED' },
  });

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.webhook.delete',
    targetType: 'WebhookEndpoint',
    targetId: endpoint.id,
    metadata: { softDeleted: true },
  });

  res.status(204).send();
});

export function webhooksRouter(): Router {
  const router = Router();
  router.get('/deliveries', requireScope(SCOPES.WEBHOOKS_MANAGE), deliveriesRoute);
  router.get('/', requireScope(SCOPES.WEBHOOKS_MANAGE), listRoute);
  router.post('/', requireScope(SCOPES.WEBHOOKS_MANAGE), createRoute);
  router.post('/:id/test', requireScope(SCOPES.WEBHOOKS_MANAGE), testRoute);
  router.delete('/:id', requireScope(SCOPES.WEBHOOKS_MANAGE), deleteRoute);
  return router;
}
