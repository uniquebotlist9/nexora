import { Router } from 'express';
import { z } from 'zod';
import { prisma, type Prisma } from '@nexora/database';
import { paginationSchema, ticketConfigInputSchema } from '@nexora/validation';
import { TICKET_STATUSES } from '@nexora/types';
import type { RequestHandler } from 'express';
import { asyncH } from '../lib/async';
import { getApiKey, requireScope, SCOPES } from '../auth/api-key';
import { requireGuild } from '../lib/guild-access';
import { auditApiCall } from '../lib/audit';
import { parse, paginated, offset } from '../lib/http';

// NOTE (mongodb connector): Ticket.status / priority are plain String columns;
// valid values come from @nexora/types (TICKET_STATUSES) and the zod schemas.

const ticketsQuerySchema = paginationSchema.extend({
  status: z.enum(TICKET_STATUSES).optional(),
});

/** Fields of the TicketConfig row that the API may write (create-shaped; plain values are valid for updates too). */
function toConfigData(input: z.infer<typeof ticketConfigInputSchema>): Omit<Prisma.TicketConfigUncheckedCreateInput, 'guildId'> {
  return {
    enabled: input.enabled,
    // The panel channel is where the ticket panel message lives; the schema's
    // channelId maps onto it.
    panelChannelId: input.channelId ?? null,
    transcriptChannelId: input.transcriptChannelId ?? null,
    staffRoleIds: input.staffRoleIds,
    blacklist: input.blacklist,
    types: input.types as unknown as Prisma.InputJsonValue,
    inactivityHours: input.inactivityHours,
    claimRequired: input.claimRequired,
  };
}

/** GET /v1/guilds/:guildId/tickets/config */
const getConfigRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const config = await prisma.ticketConfig.findUnique({ where: { guildId: guild.id } });
  res.json({ config });
});

/** PUT /v1/guilds/:guildId/tickets/config — upsert the ticket configuration. */
const putConfigRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  const input = parse(ticketConfigInputSchema, req.body, 'body');

  const config = await prisma.ticketConfig.upsert({
    where: { guildId: guild.id },
    create: { guildId: guild.id, ...toConfigData(input) },
    update: toConfigData(input),
  });

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.ticketConfig.update',
    targetType: 'TicketConfig',
    targetId: config.id,
    metadata: { enabled: config.enabled },
  });

  res.json({ config });
});

/**
 * GET /v1/guilds/:guildId/tickets — paginated tickets with optional status
 * filter and a per-status summary (stats) in the response.
 */
const listTicketsRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const q = parse(ticketsQuerySchema, req.query, 'query');

  const where: Prisma.TicketWhereInput = { guildId: guild.id };
  if (q.status) where.status = q.status;

  const [total, items, grouped] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset(q),
      take: q.pageSize,
      select: {
        id: true,
        number: true,
        channelId: true,
        channelName: true,
        typeId: true,
        creatorId: true,
        claimedById: true,
        status: true,
        priority: true,
        subject: true,
        tags: true,
        rating: true,
        closedAt: true,
        reopenCount: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.ticket.groupBy({
      by: ['status'],
      where: { guildId: guild.id },
      _count: { _all: true },
    }),
  ]);

  const stats: Record<string, number> = {};
  for (const group of grouped) stats[group.status] = group._count._all;

  res.json({ ...paginated(items, total, q.page, q.pageSize), stats });
});

export function ticketsRouter(): Router {
  const router = Router();
  router.get('/config', requireScope(SCOPES.GUILDS_READ), getConfigRoute);
  router.put('/config', requireScope(SCOPES.GUILDS_WRITE), putConfigRoute);
  router.get('/', requireScope(SCOPES.GUILDS_READ), listTicketsRoute);
  return router;
}
