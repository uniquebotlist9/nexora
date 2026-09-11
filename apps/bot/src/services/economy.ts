import { PermissionFlagsBits, type Guild } from 'discord.js';
import { prisma, type EconomyAccount, type EconomyConfig, type ShopItem } from '@nexora/database';
import { limitsForPlan } from '@nexora/types';
import { serializeError } from '@nexora/logger';
import { getContext } from '../core/context';
import { ensureGuildMember, getGuildPlan } from '../core/guilds';
import { randomInt, safeJsonParse, truncate } from '../core/utils';

export interface EconomyResult {
  ok: boolean;
  message: string;
  amount?: number;
  balance?: number;
  bank?: number;
}

export interface InventoryItem {
  itemId: string;
  name: string;
  quantity: number;
}

const configCache = new Map<string, { config: EconomyConfig; expiresAt: number }>();
const CONFIG_TTL_MS = 60_000;

export function invalidateEconomyConfigCache(guildId: string): void {
  configCache.delete(guildId);
}

export async function getEconomyConfig(guildId: string): Promise<EconomyConfig> {
  const cached = configCache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) return cached.config;
  const config = await prisma.economyConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
  configCache.set(guildId, { config, expiresAt: Date.now() + CONFIG_TTL_MS });
  return config;
}

/** Gate: economy must be enabled in config and included in the guild's plan. */
export async function isEconomyUsable(guildId: string): Promise<boolean> {
  const config = await getEconomyConfig(guildId);
  if (!config.enabled) return false;
  return limitsForPlan(await getGuildPlan(guildId)).economy;
}

/** Ensure and return the member's EconomyAccount (linked to their GuildMember row). */
export async function getAccount(guildId: string, userId: string): Promise<EconomyAccount> {
  const config = await getEconomyConfig(guildId);
  await ensureGuildMember(guildId, userId);

  const existing = await prisma.economyAccount.findUnique({
    where: { userId_guildId: { userId, guildId } },
  });
  if (existing) return existing;

  const memberRow = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId, guildId } },
    select: { id: true },
  });
  return prisma.economyAccount.create({
    data: {
      userId,
      guildId,
      balance: config.startingBalance,
      memberId: memberRow?.id ?? null,
    },
  });
}

async function record(
  accountId: string,
  type: string,
  amount: number,
  description?: string,
  counterpartyId?: string,
): Promise<void> {
  await prisma.economyTransaction.create({
    data: {
      accountId,
      type,
      amount,
      description: description ? truncate(description, 500) : undefined,
      counterpartyId,
    },
  });
}

function cooldownMessage(lastAt: Date | null, cooldownMs: number): string | null {
  if (!lastAt) return null;
  const elapsed = Date.now() - lastAt.getTime();
  if (elapsed >= cooldownMs) return null;
  const minutes = Math.ceil((cooldownMs - elapsed) / 60_000);
  return `You can do that again in ${minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`}.`;
}

export async function claimDaily(guildId: string, userId: string): Promise<EconomyResult> {
  const config = await getEconomyConfig(guildId);
  const account = await getAccount(guildId, userId);
  const wait = cooldownMessage(account.lastDaily, 24 * 60 * 60_000);
  if (wait) return { ok: false, message: wait };
  const updated = await prisma.economyAccount.update({
    where: { id: account.id },
    data: { balance: { increment: config.dailyAmount }, lastDaily: new Date() },
  });
  await record(account.id, 'DAILY', config.dailyAmount, 'Daily reward');
  return { ok: true, message: `You claimed your daily **${config.dailyAmount}** ${config.currencyName}!`, amount: config.dailyAmount, balance: updated.balance };
}

export async function claimWeekly(guildId: string, userId: string): Promise<EconomyResult> {
  const config = await getEconomyConfig(guildId);
  const account = await getAccount(guildId, userId);
  const wait = cooldownMessage(account.lastWeekly, 7 * 24 * 60 * 60_000);
  if (wait) return { ok: false, message: wait };
  const updated = await prisma.economyAccount.update({
    where: { id: account.id },
    data: { balance: { increment: config.weeklyAmount }, lastWeekly: new Date() },
  });
  await record(account.id, 'WEEKLY', config.weeklyAmount, 'Weekly reward');
  return { ok: true, message: `You claimed your weekly **${config.weeklyAmount}** ${config.currencyName}!`, amount: config.weeklyAmount, balance: updated.balance };
}

export async function doWork(guildId: string, userId: string): Promise<EconomyResult> {
  const config = await getEconomyConfig(guildId);
  const account = await getAccount(guildId, userId);
  const wait = cooldownMessage(account.lastWork, config.workCooldownMinutes * 60_000);
  if (wait) return { ok: false, message: wait };
  const amount = randomInt(config.workMin, config.workMax);
  const updated = await prisma.economyAccount.update({
    where: { id: account.id },
    data: { balance: { increment: amount }, lastWork: new Date() },
  });
  await record(account.id, 'WORK', amount, 'Work reward');
  return { ok: true, message: `You worked hard and earned **${amount}** ${config.currencyName}!`, amount, balance: updated.balance };
}

export async function doCrime(guildId: string, userId: string): Promise<EconomyResult> {
  const config = await getEconomyConfig(guildId);
  const account = await getAccount(guildId, userId);
  const wait = cooldownMessage(account.lastCrime, config.crimeCooldownMinutes * 60_000);
  if (wait) return { ok: false, message: wait };

  const success = Math.random() < config.crimeSuccessRate;
  if (success) {
    const amount = randomInt(config.workMin, config.workMax);
    const updated = await prisma.economyAccount.update({
      where: { id: account.id },
      data: { balance: { increment: amount }, lastCrime: new Date() },
    });
    await record(account.id, 'CRIME', amount, 'Crime succeeded');
    return { ok: true, message: `You got away with it and stole **${amount}** ${config.currencyName}!`, amount, balance: updated.balance };
  }

  const fine = Math.min(randomInt(10, Math.max(config.crimeFineMax, 10)), account.balance);
  const updated = await prisma.economyAccount.update({
    where: { id: account.id },
    data: { balance: { decrement: fine }, lastCrime: new Date() },
  });
  await record(account.id, 'CRIME', -fine, 'Crime failed — fine paid');
  return { ok: true, message: `You got caught and paid a **${fine}** ${config.currencyName} fine.`, amount: -fine, balance: updated.balance };
}

/** Fixed rob cooldown (documented): 5 minutes. */
const ROB_COOLDOWN_MS = 5 * 60_000;

export async function robUser(guildId: string, userId: string, targetId: string): Promise<EconomyResult> {
  if (userId === targetId) return { ok: false, message: 'You cannot rob yourself.' };
  const config = await getEconomyConfig(guildId);
  const account = await getAccount(guildId, userId);
  const wait = cooldownMessage(account.lastRob, ROB_COOLDOWN_MS);
  if (wait) return { ok: false, message: wait };

  const target = await getAccount(guildId, targetId);
  if (target.balance < 50) return { ok: false, message: 'That user does not have enough coins to be worth robbing.' };

  const success = Math.random() < 0.4;
  if (success) {
    const amount = Math.max(10, Math.floor(target.balance * (randomInt(10, 30) / 100)));
    const [robber, victim] = await prisma.$transaction([
      prisma.economyAccount.update({
        where: { id: account.id },
        data: { balance: { increment: amount }, lastRob: new Date() },
      }),
      prisma.economyAccount.update({
        where: { id: target.id },
        data: { balance: { decrement: amount } },
      }),
    ]);
    await record(account.id, 'ROB_WIN', amount, `Robbed <@${targetId}>`, targetId);
    await record(target.id, 'ROB_LOSS', -amount, `Robbed by <@${userId}>`, userId);
    return { ok: true, message: `You robbed **${amount}** ${config.currencyName}!`, amount, balance: robber.balance };
  }

  const fine = Math.min(Math.max(10, Math.floor(target.balance * 0.05)), account.balance);
  const [robber, victim] = await prisma.$transaction([
    prisma.economyAccount.update({
      where: { id: account.id },
      data: { balance: { decrement: fine }, lastRob: new Date() },
    }),
    prisma.economyAccount.update({
      where: { id: target.id },
      data: { balance: { increment: fine } },
    }),
  ]);
  await record(account.id, 'ROB_LOSS', -fine, `Failed rob against <@${targetId}>`, targetId);
  await record(target.id, 'ROB_WIN', fine, `Compensation from <@${userId}>`, userId);
  return { ok: true, message: `You failed and paid **${fine}** ${config.currencyName} to your target.`, amount: -fine, balance: robber.balance, bank: victim.bank };
}

export async function transferFunds(guildId: string, fromId: string, toId: string, amount: number): Promise<EconomyResult> {
  if (amount <= 0) return { ok: false, message: 'Amount must be positive.' };
  if (fromId === toId) return { ok: false, message: 'You cannot pay yourself.' };
  const config = await getEconomyConfig(guildId);
  const from = await getAccount(guildId, fromId);
  if (from.balance < amount) return { ok: false, message: `You only have **${from.balance}** ${config.currencyName}.` };

  const to = await getAccount(guildId, toId);
  const [sender] = await prisma.$transaction([
    prisma.economyAccount.update({ where: { id: from.id }, data: { balance: { decrement: amount } } }),
    prisma.economyAccount.update({ where: { id: to.id }, data: { balance: { increment: amount } } }),
  ]);
  await record(from.id, 'TRANSFER_OUT', -amount, `Paid <@${toId}>`, toId);
  await record(to.id, 'TRANSFER_IN', amount, `Received from <@${fromId}>`, fromId);
  return { ok: true, message: `You paid **${amount}** ${config.currencyName} to <@${toId}>.`, amount, balance: sender.balance };
}

export async function bankOperation(guildId: string, userId: string, action: 'deposit' | 'withdraw', amount: number): Promise<EconomyResult> {
  if (amount <= 0) return { ok: false, message: 'Amount must be positive.' };
  const config = await getEconomyConfig(guildId);
  const account = await getAccount(guildId, userId);
  if (action === 'deposit') {
    if (account.balance < amount) return { ok: false, message: `You only have **${account.balance}** ${config.currencyName} in your wallet.` };
    const updated = await prisma.economyAccount.update({
      where: { id: account.id },
      data: { balance: { decrement: amount }, bank: { increment: amount } },
    });
    return { ok: true, message: `Deposited **${amount}** ${config.currencyName} to your bank.`, amount, balance: updated.balance, bank: updated.bank };
  }
  if (account.bank < amount) return { ok: false, message: `You only have **${account.bank}** ${config.currencyName} in your bank.` };
  const updated = await prisma.economyAccount.update({
    where: { id: account.id },
    data: { balance: { increment: amount }, bank: { decrement: amount } },
  });
  return { ok: true, message: `Withdrew **${amount}** ${config.currencyName} from your bank.`, amount, balance: updated.balance, bank: updated.bank };
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

export async function listShopItems(guildId: string): Promise<ShopItem[]> {
  return prisma.shopItem.findMany({
    where: { guildId, enabled: true },
    orderBy: { price: 'asc' },
    take: 25,
  });
}

export function parseInventory(account: EconomyAccount): InventoryItem[] {
  return safeJsonParse<InventoryItem[]>(account.inventory) ?? [];
}

export async function buyShopItem(guild: Guild, userId: string, itemName: string): Promise<EconomyResult> {
  const config = await getEconomyConfig(guild.id);
  const item = await prisma.shopItem.findUnique({
    where: { guildId_name: { guildId: guild.id, name: itemName } },
  });
  if (!item || !item.enabled) return { ok: false, message: 'That shop item does not exist.' };

  const account = await getAccount(guild.id, userId);
  if (account.balance < item.price) {
    return { ok: false, message: `You need **${item.price}** ${config.currencyName} but only have **${account.balance}**.` };
  }
  if (item.stock !== null && item.stock <= 0) return { ok: false, message: 'This item is out of stock.' };

  const inventory = parseInventory(account);
  const owned = inventory.find((entry) => entry.itemId === item.id);
  if (owned && owned.quantity >= item.maxPerUser) {
    return { ok: false, message: `You can only buy this item ${item.maxPerUser}×.` };
  }

  // Role items: verify the bot can grant the role before charging.
  if (item.roleId) {
    const role = guild.roles.cache.get(item.roleId);
    const me = guild.members.me;
    if (!role || !me?.permissions.has(PermissionFlagsBits.ManageRoles) || role.position >= me.roles.highest.position) {
      return { ok: false, message: 'The reward role for this item is not configured correctly. Please contact a moderator.' };
    }
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member && member.roles.cache.has(role.id) && item.maxPerUser <= 1) {
      return { ok: false, message: 'You already own the role granted by this item.' };
    }
  }

  if (owned) {
    owned.quantity += 1;
  } else {
    inventory.push({ itemId: item.id, name: item.name, quantity: 1 });
  }

  const updated = await prisma.economyAccount.update({
    where: { id: account.id },
    data: { balance: { decrement: item.price }, inventory: JSON.parse(JSON.stringify(inventory)) },
  });
  await prisma.shopItem
    .update({ where: { id: item.id }, data: { stock: item.stock === null ? undefined : { decrement: 1 } } })
    .catch((err) => getContext().log.warn({ err: serializeError(err) }, 'Stock decrement failed'));
  await record(account.id, 'SHOP_BUY', -item.price, `Bought ${item.name}`);

  if (item.roleId) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) {
      await member.roles.add(item.roleId, `Shop purchase: ${item.name}`).catch(() => undefined);
    }
  }

  return {
    ok: true,
    message: `You bought **${item.name}** for **${item.price}** ${config.currencyName}!`,
    amount: -item.price,
    balance: updated.balance,
  };
}
