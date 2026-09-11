'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@nexora/database';
import { autoModRuleInputSchema } from '@nexora/validation';
import { assertGuildAccess } from '@/lib/guild';
import { ok, err, zodFieldErrors, type ActionResult } from '@/lib/result';

export type AutoModRuleInput = {
  name: string;
  type: string;
  enabled: boolean;
  trigger: Record<string, unknown>;
  actions: { type: string; durationMinutes?: number; roleId?: string; points?: number }[];
  exemptRoleIds: string[];
  exemptChannelIds: string[];
};

/** Create a new AutoMod rule (plan limit enforced by the caller). */
export async function createAutoModRule(guildId: string, input: AutoModRuleInput): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;

  const parsed = autoModRuleInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid rule configuration', zodFieldErrors(parsed.error));

  try {
    await prisma.autoModRule.create({
      data: {
        guildId,
        name: parsed.data.name,
        type: parsed.data.type,
        enabled: parsed.data.enabled,
        trigger: parsed.data.trigger,
        actions: parsed.data.actions,
        exemptRoleIds: parsed.data.exemptRoleIds,
        exemptChannelIds: parsed.data.exemptChannelIds,
      },
    });
    await prisma.auditLog.create({
      data: { actorType: 'USER', guildId, action: 'automod.rule_created', targetType: 'AUTOMOD_RULE', targetId: parsed.data.name },
    });
    revalidatePath(`/dashboard/g/${guildId}/automod`);
    return ok();
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      return err('A rule with that name already exists.');
    }
    return err('Could not create the rule. Please try again.');
  }
}

export async function updateAutoModRule(
  guildId: string,
  ruleId: string,
  input: AutoModRuleInput,
): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;

  const parsed = autoModRuleInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid rule configuration', zodFieldErrors(parsed.error));

  try {
    await prisma.autoModRule.update({
      where: { id: ruleId },
      data: {
        name: parsed.data.name,
        type: parsed.data.type,
        enabled: parsed.data.enabled,
        trigger: parsed.data.trigger,
        actions: parsed.data.actions,
        exemptRoleIds: parsed.data.exemptRoleIds,
        exemptChannelIds: parsed.data.exemptChannelIds,
      },
    });
    await prisma.auditLog.create({
      data: { actorType: 'USER', guildId, action: 'automod.rule_updated', targetType: 'AUTOMOD_RULE', targetId: ruleId },
    });
    revalidatePath(`/dashboard/g/${guildId}/automod`);
    return ok();
  } catch {
    return err('Could not update the rule.');
  }
}

export async function deleteAutoModRule(guildId: string, ruleId: string): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;
  try {
    await prisma.autoModRule.deleteMany({ where: { id: ruleId, guildId } });
    await prisma.auditLog.create({
      data: { actorType: 'USER', guildId, action: 'automod.rule_deleted', targetType: 'AUTOMOD_RULE', targetId: ruleId },
    });
    revalidatePath(`/dashboard/g/${guildId}/automod`);
    return ok();
  } catch {
    return err('Could not delete the rule.');
  }
}

export async function toggleAutoModRule(
  guildId: string,
  ruleId: string,
  enabled: boolean,
): Promise<ActionResult> {
  const denied = await assertGuildAccess(guildId);
  if (denied) return denied;
  try {
    await prisma.autoModRule.updateMany({ where: { id: ruleId, guildId }, data: { enabled } });
    revalidatePath(`/dashboard/g/${guildId}/automod`);
    return ok();
  } catch {
    return err('Could not toggle the rule.');
  }
}
