'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@nexora/database';
import { levelConfigInputSchema } from '@nexora/validation';
import { assertGuildAccess } from '@/lib/guild';
import { ok, err, zodFieldErrors, type ActionResult } from '@/lib/result';

export interface LevelConfigInput {
  enabled: boolean;
  xpMin: number;
  xpMax: number;
  cooldownSeconds: number;
  multipliers: { roleId: string; multiplier: number }[];
  ignoreChannelIds: string[];
  announceChannelId: string | null;
  announceTemplate: string;
  dmEnabled: boolean;
  dmTemplate: string;
  roleRewards: { level: number; roleId: string; keepPrevious: boolean }[];
}

export async function saveLevelConfig(guildId: string, input: LevelConfigInput): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;

  const parsed = levelConfigInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid leveling configuration', zodFieldErrors(parsed.error));

  try {
    await prisma.levelConfig.upsert({
      where: { guildId },
      create: {
        guildId,
        enabled: parsed.data.enabled,
        xpMin: parsed.data.xpMin,
        xpMax: parsed.data.xpMax,
        cooldownSeconds: parsed.data.cooldownSeconds,
        multipliers: parsed.data.multipliers,
        ignoreChannelIds: parsed.data.ignoreChannelIds,
        announceChannelId: parsed.data.announceChannelId ?? null,
        announceTemplate: parsed.data.announceTemplate ?? 'GG {user}, you reached level {level}!',
        dmEnabled: parsed.data.dmEnabled,
        dmTemplate: parsed.data.dmTemplate ?? 'You reached level {level} in {server}!',
        roleRewards: parsed.data.roleRewards,
      },
      update: {
        enabled: parsed.data.enabled,
        xpMin: parsed.data.xpMin,
        xpMax: parsed.data.xpMax,
        cooldownSeconds: parsed.data.cooldownSeconds,
        multipliers: parsed.data.multipliers,
        ignoreChannelIds: parsed.data.ignoreChannelIds,
        announceChannelId: parsed.data.announceChannelId ?? null,
        announceTemplate: parsed.data.announceTemplate ?? 'GG {user}, you reached level {level}!',
        dmEnabled: parsed.data.dmEnabled,
        dmTemplate: parsed.data.dmTemplate ?? 'You reached level {level} in {server}!',
        roleRewards: parsed.data.roleRewards,
      },
    });
    revalidatePath(`/dashboard/g/${guildId}/leveling`);
    return ok();
  } catch {
    return err('Could not save the leveling configuration.');
  }
}

export interface EconomyConfigInput {
  enabled: boolean;
  currencyName: string;
  currencySymbol: string;
  dailyAmount: number;
  weeklyAmount: number;
  workCooldownMinutes: number;
  workMin: number;
  workMax: number;
  crimeCooldownMinutes: number;
  crimeSuccessRate: number;
  crimeFineMax: number;
  startingBalance: number;
}

export async function saveEconomyConfig(guildId: string, input: EconomyConfigInput): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;

  if (!input.currencyName.trim()) return err('Currency name is required.', { currencyName: 'Required' });
  if (input.workMin > input.workMax) return err('Work minimum must not exceed work maximum.', { workMin: 'Must be ≤ work max' });
  if (input.crimeSuccessRate < 0 || input.crimeSuccessRate > 1) {
    return err('Crime success rate must be between 0 and 1.', { crimeSuccessRate: '0–1' });
  }

  try {
    await prisma.economyConfig.upsert({
      where: { guildId },
      create: { guildId, ...input },
      update: input,
    });
    revalidatePath(`/dashboard/g/${guildId}/economy`);
    return ok();
  } catch {
    return err('Could not save the economy configuration.');
  }
}

export interface ShopItemInput {
  name: string;
  description: string;
  price: number;
  roleId?: string;
  stock?: number;
}

export async function createShopItem(guildId: string, input: ShopItemInput): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;
  if (!input.name.trim()) return err('Item name is required.');
  if (input.price < 1) return err('Price must be at least 1.');
  try {
    await prisma.shopItem.create({
      data: {
        guildId,
        name: input.name.trim(),
        description: input.description,
        price: input.price,
        roleId: input.roleId,
        stock: input.stock,
      },
    });
    revalidatePath(`/dashboard/g/${guildId}/economy`);
    return ok();
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return err('An item with that name already exists.');
    return err('Could not create the shop item.');
  }
}

export async function deleteShopItem(guildId: string, itemId: string): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;
  try {
    await prisma.shopItem.deleteMany({ where: { id: itemId, guildId } });
    revalidatePath(`/dashboard/g/${guildId}/economy`);
    return ok();
  } catch {
    return err('Could not delete the shop item.');
  }
}

export async function toggleShopItem(guildId: string, itemId: string, enabled: boolean): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;
  try {
    await prisma.shopItem.updateMany({ where: { id: itemId, guildId }, data: { enabled } });
    revalidatePath(`/dashboard/g/${guildId}/economy`);
    return ok();
  } catch {
    return err('Could not update the shop item.');
  }
}
