import { z } from 'zod';
import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type Message,
  type TextBasedChannel,
} from 'discord.js';
import type { AutomationTriggerType } from '@nexora/types';
import {
  prisma,
  type Automation,
  type ScheduledTask,
} from '@nexora/database';
import { automationActionInputSchema, automationTriggerInputSchema } from '@nexora/validation';
import { canManageRoleAt } from '@nexora/permissions';
import { toMessageOptions, type TemplateContext } from '@nexora/discord';
import { serializeError } from '@nexora/logger';
import { getContext } from '../core/context';
import { safeJsonParse, toJson, truncate } from '../core/utils';
import { scheduleTask } from './task-queue';
import { logEvent } from './logging';

const triggerConfigSchema = automationTriggerInputSchema.shape.config;
type TriggerConfig = z.infer<typeof triggerConfigSchema>;
type ActionInput = z.infer<typeof automationActionInputSchema>;

export interface AutomationContext {
  userId?: string;
  member?: GuildMember | null;
  message?: Message;
  channel?: TextBasedChannel | null;
  level?: number;
  roleId?: string;
  memberCount?: number;
}

function matchesTriggerFilter(automation: Automation, config: TriggerConfig, ctx: AutomationContext): boolean {
  switch (automation.trigger) {
    case 'KEYWORD_DETECTED': {
      if (!config.keywords || config.keywords.length === 0) return true;
      const content = (ctx.message?.content ?? '').toLowerCase();
      if (!content) return false;
      return config.keywords.some((keyword) => content.includes(keyword.toLowerCase()));
    }
    case 'ROLE_ADDED':
    case 'ROLE_REMOVED':
      return !config.roleId || config.roleId === ctx.roleId;
    case 'LEVEL_REACHED':
      return config.level === undefined || (ctx.level ?? 0) >= config.level;
    case 'MILESTONE':
      return config.memberCount === undefined || (ctx.memberCount ?? 0) >= config.memberCount;
    default:
      return true;
  }
}

async function executeAction(guild: Guild, action: ActionInput, ctx: AutomationContext, templateContext: TemplateContext): Promise<void> {
  const { client, log } = getContext();
  const me = guild.members.me;
  const config = action.config ?? {};

  switch (action.type) {
    case 'SEND_MESSAGE': {
      if (!config.channelId || !config.message) return;
      const channel = await client.channels.fetch(config.channelId).catch(() => null);
      if (channel?.isSendable()) {
        await channel.send(toMessageOptions(config.message, templateContext));
      }
      return;
    }
    case 'SEND_DM': {
      const member = ctx.member ?? (ctx.userId ? await guild.members.fetch(ctx.userId).catch(() => null) : null);
      if (member && config.message) {
        await member.send(toMessageOptions(config.message, templateContext)).catch(() => undefined);
      }
      return;
    }
    case 'ADD_ROLE':
    case 'REMOVE_ROLE': {
      if (!config.roleId || !me?.permissions.has(PermissionFlagsBits.ManageRoles)) return;
      const role = guild.roles.cache.get(config.roleId);
      if (!role || !canManageRoleAt(me.roles.highest.position, role.position, false)) return;
      const member = ctx.member ?? (ctx.userId ? await guild.members.fetch(ctx.userId).catch(() => null) : null);
      if (!member) return;
      if (action.type === 'ADD_ROLE') {
        await member.roles.add(role, 'Automation').catch(() => undefined);
      } else {
        await member.roles.remove(role, 'Automation').catch(() => undefined);
      }
      return;
    }
    case 'TIMEOUT': {
      if (!me?.permissions.has(PermissionFlagsBits.ModerateMembers) || !config.durationMinutes) return;
      const member = ctx.member ?? (ctx.userId ? await guild.members.fetch(ctx.userId).catch(() => null) : null);
      if (member && !member.user.bot && canAct(me, member)) {
        await member.timeout(config.durationMinutes * 60_000, 'Automation').catch(() => undefined);
      }
      return;
    }
    case 'CREATE_CHANNEL': {
      if (!config.channelName || !me?.permissions.has(PermissionFlagsBits.ManageChannels)) return;
      await guild.channels
        .create({ name: config.channelName, type: ChannelType.GuildText })
        .catch((err) => log.warn({ err: serializeError(err) }, 'Automation CREATE_CHANNEL failed'));
      return;
    }
    case 'DELETE_CHANNEL': {
      if (!config.channelId || !me?.permissions.has(PermissionFlagsBits.ManageChannels)) return;
      const channel = await client.channels.fetch(config.channelId).catch(() => null);
      if (channel && 'delete' in channel) {
        await channel.delete('Automation').catch(() => undefined);
      }
      return;
    }
    case 'LOG_EVENT': {
      await prisma.logEvent
        .create({
          data: {
            guildId: guild.id,
            category: 'serverChanges',
            action: truncate(`Automation: ${config.channelName ?? `action ${action.type}`}`, 200),
            actorId: client.user?.id,
            targetId: ctx.userId ?? null,
            metadata: toJson({ action: action.type }),
          },
        })
        .catch(() => undefined);
      return;
    }
    case 'CREATE_TICKET': {
      if (!ctx.userId) return;
      // Dynamic import avoids a require-cycle between automations <-> tickets.
      const tickets = await import('./tickets');
      await tickets
        .createTicketForAutomation(guild, ctx.userId, config.ticketType ?? 'support')
        .catch((err) => log.warn({ err: serializeError(err) }, 'Automation CREATE_TICKET failed'));
      return;
    }
    case 'CHANGE_NICKNAME': {
      if (!config.nickname || !me?.permissions.has(PermissionFlagsBits.ManageNicknames)) return;
      const member = ctx.member ?? (ctx.userId ? await guild.members.fetch(ctx.userId).catch(() => null) : null);
      if (member) {
        await member.setNickname(config.nickname, 'Automation').catch(() => undefined);
      }
      return;
    }
    case 'SEND_WEBHOOK': {
      if (!config.webhookUrl) return;
      await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'Nexora Automation',
          content: config.message?.content ? truncate(config.message.content, 2000) : undefined,
        }),
      }).catch((err) => log.warn({ err: serializeError(err) }, 'Automation SEND_WEBHOOK failed'));
      return;
    }
    default:
      return;
  }
}

function canAct(me: GuildMember, target: GuildMember): boolean {
  if (target.id === target.guild.ownerId) return false;
  return me.roles.highest.position > target.roles.highest.position;
}

function buildTemplateContext(guild: Guild, ctx: AutomationContext): TemplateContext {
  return {
    user: ctx.userId ? `<@${ctx.userId}>` : undefined,
    username: ctx.member?.user.username,
    userid: ctx.userId,
    server: guild.name,
    membercount: ctx.memberCount ?? guild.memberCount,
    channel: ctx.channel ? `<#${ctx.channel.id}>` : undefined,
    level: ctx.level,
  };
}

/**
 * Dispatch an automation trigger to all matching, enabled automations of the
 * guild. Each automation and each action is isolated — a failure never stops
 * the rest.
 */
export async function dispatchAutomationTrigger(
  guild: Guild,
  trigger: AutomationTriggerType,
  ctx: AutomationContext,
): Promise<void> {
  const { log } = getContext();
  const automations = await prisma.automation.findMany({
    where: { guildId: guild.id, trigger: trigger as AutomationTriggerType, enabled: true },
  });
  if (automations.length === 0) return;

  const templateContext = buildTemplateContext(guild, ctx);

  for (const automation of automations) {
    try {
      const triggerParsed = triggerConfigSchema.safeParse(safeJsonParse(automation.triggerConfig) ?? {});
      const triggerConfig: TriggerConfig = triggerParsed.success ? triggerParsed.data : {};
      if (!matchesTriggerFilter(automation, triggerConfig, ctx)) continue;

      const rawActions = Array.isArray(automation.actions) ? (automation.actions as unknown[]) : [];
      let executed = 0;
      for (const raw of rawActions) {
        const parsed = automationActionInputSchema.safeParse(raw);
        if (!parsed.success) continue;
        await executeAction(guild, parsed.data, ctx, templateContext);
        executed += 1;
      }
      if (executed > 0) {
        await prisma.automation
          .update({
            where: { id: automation.id },
            data: { triggerCount: { increment: 1 }, lastTriggeredAt: new Date() },
          })
          .catch(() => undefined);
        await logEvent(guild, 'serverChanges', {
          action: `Automation "${automation.name}" triggered (${executed} actions)`,
          actorId: ctx.userId,
          eventChannelId: ctx.channel?.id,
          metadata: { automation: automation.name, trigger },
          title: 'Automation triggered',
        }).catch(() => undefined);
      }
    } catch (err) {
      log.warn({ err: serializeError(err), automationId: automation.id }, 'Automation execution failed');
    }
  }
}

// ---------------------------------------------------------------------------
// SCHEDULED triggers
// ---------------------------------------------------------------------------

/**
 * Ensure every enabled SCHEDULED automation has a pending ScheduledTask.
 * Called on ready and guildCreate. Re-arming happens in the scheduler after
 * each run.
 */
export async function ensureScheduledAutomations(guildId: string): Promise<void> {
  const automations = await prisma.automation.findMany({
    where: { guildId, trigger: 'SCHEDULED', enabled: true },
  });
  for (const automation of automations) {
    const triggerParsed = triggerConfigSchema.safeParse(safeJsonParse(automation.triggerConfig) ?? {});
    const intervalMinutes = triggerParsed.success ? triggerParsed.data.intervalMinutes : undefined;
    if (!intervalMinutes) continue;

    // Mongo connector has no JSON path filters — filter by full-document equality.
    const pending = await prisma.scheduledTask.findFirst({
      where: {
        guildId,
        kind: 'AUTOMATION',
        completedAt: null,
        payload: { equals: toJson({ automationId: automation.id }) },
      },
      select: { id: true },
    });
    if (!pending) {
      await scheduleTask({
        guildId,
        kind: 'AUTOMATION',
        payload: { automationId: automation.id },
        runAt: new Date(Date.now() + intervalMinutes * 60_000),
      });
    }
  }
}

/**
 * Scheduler callback for an AUTOMATION task: dispatch the SCHEDULED trigger
 * and re-arm the next occurrence. Returns false when the automation was
 * deleted/disabled (task should not re-arm).
 */
export async function runScheduledAutomation(task: ScheduledTask): Promise<boolean> {
  const payload = safeJsonParse<{ automationId?: string }>(task.payload) ?? {};
  const automationId = payload.automationId;
  if (!automationId) return false;

  const automation = await prisma.automation.findUnique({ where: { id: automationId } });
  if (!automation || !automation.enabled || automation.trigger !== 'SCHEDULED') {
    return false;
  }

  const guild = await getContext().client.guilds.fetch(task.guildId).catch(() => null);
  if (guild) {
    await dispatchAutomationTrigger(guild, 'SCHEDULED', { memberCount: guild.memberCount });
  }

  const triggerParsed = triggerConfigSchema.safeParse(safeJsonParse(automation.triggerConfig) ?? {});
  const intervalMinutes = triggerParsed.success ? triggerParsed.data.intervalMinutes : undefined;
  if (intervalMinutes) {
    await scheduleTask({
      guildId: task.guildId,
      kind: 'AUTOMATION',
      payload: { automationId },
      runAt: new Date(Date.now() + intervalMinutes * 60_000),
    });
  }
  return true;
}
