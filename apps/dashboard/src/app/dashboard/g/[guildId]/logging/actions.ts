'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@nexora/database';
import { logConfigInputSchema } from '@nexora/validation';
import { assertGuildAccess } from '@/lib/guild';
import { ok, err, zodFieldErrors, type ActionResult } from '@/lib/result';

export interface LogCategorySetting {
  enabled: boolean;
  channelId?: string;
}

export type LogConfigCategories = Partial<Record<string, LogCategorySetting>>;

export async function saveLogConfig(
  guildId: string,
  enabled: boolean,
  categories: LogConfigCategories,
  ignoredChannelIds: string[],
): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;

  const parsed = logConfigInputSchema.safeParse({ enabled, config: categories, ignoredChannelIds });
  if (!parsed.success) return err('Invalid logging configuration', zodFieldErrors(parsed.error));

  try {
    await prisma.logConfig.upsert({
      where: { guildId },
      create: {
        guildId,
        enabled: parsed.data.enabled,
        categories: parsed.data.config,
        ignoredChannelIds: parsed.data.ignoredChannelIds,
      },
      update: {
        enabled: parsed.data.enabled,
        categories: parsed.data.config,
        ignoredChannelIds: parsed.data.ignoredChannelIds,
      },
    });
    revalidatePath(`/dashboard/g/${guildId}/logging`);
    return ok();
  } catch {
    return err('Could not save the logging configuration.');
  }
}
