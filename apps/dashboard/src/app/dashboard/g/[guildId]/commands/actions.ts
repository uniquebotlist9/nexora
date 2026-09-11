'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@nexora/database';
import { customCommandInputSchema } from '@nexora/validation';
import type { MessagePayload } from '@nexora/types';
import { assertGuildAccess } from '@/lib/guild';
import { ok, err, zodFieldErrors, type ActionResult } from '@/lib/result';

export interface CustomCommandInput {
  name: string;
  description: string;
  response: MessagePayload;
  cooldownSeconds: number;
  requiredRoleIds: string[];
  requiredPermission?: string;
  enabled: boolean;
}

export async function createCustomCommand(guildId: string, input: CustomCommandInput): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;

  const parsed = customCommandInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid command configuration', zodFieldErrors(parsed.error));

  try {
    await prisma.customCommand.create({
      data: {
        guildId,
        name: parsed.data.name,
        description: parsed.data.description,
        response: parsed.data.response,
        cooldownSeconds: parsed.data.cooldownSeconds,
        requiredRoleIds: parsed.data.requiredRoleIds,
        requiredPermission: parsed.data.requiredPermission,
        enabled: parsed.data.enabled,
      },
    });
    revalidatePath(`/dashboard/g/${guildId}/commands`);
    return ok();
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return err('A command with that name already exists.');
    return err('Could not create the command.');
  }
}

export async function updateCustomCommand(
  guildId: string,
  commandId: string,
  input: CustomCommandInput,
): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;

  const parsed = customCommandInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid command configuration', zodFieldErrors(parsed.error));

  try {
    await prisma.customCommand.update({
      where: { id: commandId },
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        response: parsed.data.response,
        cooldownSeconds: parsed.data.cooldownSeconds,
        requiredRoleIds: parsed.data.requiredRoleIds,
        requiredPermission: parsed.data.requiredPermission,
        enabled: parsed.data.enabled,
      },
    });
    revalidatePath(`/dashboard/g/${guildId}/commands`);
    return ok();
  } catch {
    return err('Could not update the command.');
  }
}

export async function deleteCustomCommand(guildId: string, commandId: string): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;
  try {
    await prisma.customCommand.deleteMany({ where: { id: commandId, guildId } });
    revalidatePath(`/dashboard/g/${guildId}/commands`);
    return ok();
  } catch {
    return err('Could not delete the command.');
  }
}

export async function toggleCustomCommand(
  guildId: string,
  commandId: string,
  enabled: boolean,
): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;
  try {
    await prisma.customCommand.updateMany({ where: { id: commandId, guildId }, data: { enabled } });
    revalidatePath(`/dashboard/g/${guildId}/commands`);
    return ok();
  } catch {
    return err('Could not toggle the command.');
  }
}
