import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@nexora/database';
import { limitsForPlan } from '@nexora/types';
import { snowflakeSchema } from '@nexora/validation';
import type { RequestHandler } from 'express';
import { asyncH } from '../lib/async';
import { getApiKey, requireScope, SCOPES } from '../auth/api-key';
import { requireGuild } from '../lib/guild-access';
import { resolveGuildPlan } from '../lib/plan';
import { auditApiCall } from '../lib/audit';
import { parse, paginated, parsePagination, offset } from '../lib/http';
import { AppError, ERROR_CODES } from '../lib/errors';

/**
 * Economy is a plan-gated feature: every route below checks
 * `limitsForPlan(plan).economy` before touching the DB. (Every shipped tier
 * currently includes economy, but the gate keeps the API honest if a future
 * tier removes it.)
 */
async function requireEconomyEnabled(guildId: string, userId: string): Promise<void> {
  const plan = await resolveGuildPlan(guildId, userId);
  if (!limitsForPlan(plan).economy) {
    throw new AppError(
      ERROR_CODES.PLAN_LIMIT_EXCEEDED,
      `The economy system is not available on the ${plan} plan`,
      403,
      { plan },
    );
  }
}

/**
 * EconomyConfig has no schema in @nexora/validation (it is not user-facing in
 * the bot flow), so the input shape is validated here.
 */
const economyConfigInputSchema = z
  .object({
    enabled: z.boolean().default(false),
    currencyName: z.string().min(1).max(32).default('coins'),
    currencySymbol: z.string().min(1).max(8).default('🪙'),
    dailyAmount: z.number().int().min(0).max(1_000_000).default(100),
    weeklyAmount: z.number().int().min(0).max(1_000_000).default(500),
    workCooldownMinutes: z.number().int().min(1).max(10_080).default(60),
    workMin: z.number().int().min(0).max(100_000).default(50),
    workMax: z.number().int().min(0).max(100_000).default(150),
    crimeCooldownMinutes: z.number().int().min(1).max(10_080).default(180),
    crimeSuccessRate: z.number().min(0).max(1).default(0.5),
    crimeFineMax: z.number().int().min(0).max(100_000).default(200),
    startingBalance: z.number().int().min(0).max(10_000_000).default(0),
  })
  .refine((data) => data.workMin <= data.workMax, { message: 'workMin must be <= workMax' });

const shopItemInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).default(''),
  price: z.number().int().min(0).max(100_000_000),
  roleId: snowflakeSchema.optional(),
  stock: z.number().int().min(0).max(1_000_000).nullable().optional(),
  maxPerUser: z.number().int().min(1).max(1000).default(1),
  enabled: z.boolean().default(true),
});

const shopItemPatchSchema = shopItemInputSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'No shop item fields provided' },
);

const idParamSchema = z.object({ id: z.string().min(10).max(64) });
const userIdParamSchema = z.object({ userId: snowflakeSchema });

/** GET /v1/guilds/:guildId/economy/config */
const getConfigRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  await requireEconomyEnabled(guild.id, key.userId);

  const config = await prisma.economyConfig.findUnique({ where: { guildId: guild.id } });
  res.json({ config });
});

/** PUT /v1/guilds/:guildId/economy/config */
const putConfigRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  await requireEconomyEnabled(guild.id, key.userId);
  const input = parse(economyConfigInputSchema, req.body, 'body');

  const config = await prisma.economyConfig.upsert({
    where: { guildId: guild.id },
    create: { guildId: guild.id, ...input },
    update: { ...input },
  });

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.economyConfig.update',
    targetType: 'EconomyConfig',
    targetId: config.id,
    metadata: { enabled: config.enabled, currency: config.currencyName },
  });

  res.json({ config });
});

/** GET /v1/guilds/:guildId/economy/shop — shop items, newest last by price? No: by name. */
const listShopRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  await requireEconomyEnabled(guild.id, key.userId);
  const { page, pageSize } = parsePagination(req.query);

  const where = { guildId: guild.id };
  const [total, items] = await Promise.all([
    prisma.shopItem.count({ where }),
    prisma.shopItem.findMany({ where, orderBy: { name: 'asc' }, skip: offset({ page, pageSize }), take: pageSize }),
  ]);

  res.json(paginated(items, total, page, pageSize));
});

/** POST /v1/guilds/:guildId/economy/shop — create an item (409 on duplicate name). */
const createShopRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  await requireEconomyEnabled(guild.id, key.userId);
  const input = parse(shopItemInputSchema, req.body, 'body');

  const existing = await prisma.shopItem.findFirst({ where: { guildId: guild.id, name: input.name }, select: { id: true } });
  if (existing) {
    throw new AppError(ERROR_CODES.CONFLICT, `A shop item named '${input.name}' already exists in this guild`, 409);
  }

  const item = await prisma.shopItem.create({ data: { guildId: guild.id, ...input } });

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.shopItem.create',
    targetType: 'ShopItem',
    targetId: item.id,
    metadata: { name: item.name, price: item.price },
  });

  res.status(201).json({ item });
});

/** PUT /v1/guilds/:guildId/economy/shop/:id */
const updateShopRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  await requireEconomyEnabled(guild.id, key.userId);
  const { id } = parse(idParamSchema, req.params, 'params');
  const input = parse(shopItemPatchSchema, req.body, 'body');

  const item = await prisma.shopItem.findFirst({ where: { id, guildId: guild.id } });
  if (!item) throw new AppError(ERROR_CODES.NOT_FOUND, 'Shop item not found', 404);

  if (input.name && input.name !== item.name) {
    const clash = await prisma.shopItem.findFirst({ where: { guildId: guild.id, name: input.name }, select: { id: true } });
    if (clash) throw new AppError(ERROR_CODES.CONFLICT, `A shop item named '${input.name}' already exists in this guild`, 409);
  }

  const updated = await prisma.shopItem.update({ where: { id: item.id }, data: input });

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.shopItem.update',
    targetType: 'ShopItem',
    targetId: item.id,
    metadata: { changed: Object.keys(input) },
  });

  res.json({ item: updated });
});

/** DELETE /v1/guilds/:guildId/economy/shop/:id */
const deleteShopRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  await requireEconomyEnabled(guild.id, key.userId);
  const { id } = parse(idParamSchema, req.params, 'params');

  const item = await prisma.shopItem.findFirst({ where: { id, guildId: guild.id } });
  if (!item) throw new AppError(ERROR_CODES.NOT_FOUND, 'Shop item not found', 404);

  await prisma.shopItem.delete({ where: { id: item.id } });

  await auditApiCall(req, key, {
    guildId: guild.id,
    action: 'api.shopItem.delete',
    targetType: 'ShopItem',
    targetId: item.id,
    metadata: { name: item.name },
  });

  res.status(204).send();
});

/** GET /v1/guilds/:guildId/economy/users/:userId/balance */
const balanceRoute: RequestHandler = asyncH(async (req, res) => {
  const guild = requireGuild(req);
  const key = getApiKey(req);
  await requireEconomyEnabled(guild.id, key.userId);
  const { userId } = parse(userIdParamSchema, req.params, 'params');

  const membership = await prisma.guildMember.findFirst({
    where: { guildId: guild.id, userId },
    select: { id: true },
  });
  if (!membership) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'That user is not a member of this guild', 404);
  }

  const account = await prisma.economyAccount.findUnique({
    where: { userId_guildId: { userId, guildId: guild.id } },
    select: { balance: true, bank: true, lastDaily: true, lastWeekly: true, lastWork: true, lastCrime: true, createdAt: true },
  });

  res.json({
    userId,
    guildId: guild.id,
    balance: account?.balance ?? 0,
    bank: account?.bank ?? 0,
    lastDaily: account?.lastDaily ?? null,
    lastWeekly: account?.lastWeekly ?? null,
    lastWork: account?.lastWork ?? null,
    lastCrime: account?.lastCrime ?? null,
    accountCreatedAt: account?.createdAt ?? null,
  });
});

export function economyRouter(): Router {
  const router = Router();
  router.get('/config', requireScope(SCOPES.GUILDS_READ), getConfigRoute);
  router.put('/config', requireScope(SCOPES.GUILDS_WRITE), putConfigRoute);
  router.get('/shop', requireScope(SCOPES.GUILDS_READ), listShopRoute);
  router.post('/shop', requireScope(SCOPES.GUILDS_WRITE), createShopRoute);
  router.put('/shop/:id', requireScope(SCOPES.GUILDS_WRITE), updateShopRoute);
  router.delete('/shop/:id', requireScope(SCOPES.GUILDS_WRITE), deleteShopRoute);
  router.get('/users/:userId/balance', requireScope(SCOPES.GUILDS_READ), balanceRoute);
  return router;
}
