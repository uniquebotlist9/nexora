import {
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type TextBasedChannel,
} from 'discord.js';
import type { CaseType } from '@nexora/types';
import {
  prisma,
  type Appeal,
  type ModerationCase,
} from '@nexora/database';
import { canActOnMember } from '@nexora/permissions';
import { escalationConfigSchema } from '@nexora/validation';
import { errorEmbed, formatDuration } from '@nexora/discord';
import { serializeError } from '@nexora/logger';
import { getContext } from '../core/context';
import { getGuildSettings } from '../core/guilds';
import { t } from '../core/i18n';
import { mentionUser, toJson, truncate } from '../core/utils';
import { logModeration } from './logging';
import { enqueueWebhookEvent } from './webhooks';
import { incrementAnalytics } from './analytics';
import { scheduleTask } from './task-queue';

export const MAX_TIMEOUT_MINUTES = 40_320; // 28 days, the Discord hard cap.

export type ModActionError =
  | 'self'
  | 'targetIsBot'
  | 'hierarchy'
  | 'botHierarchy'
  | 'botPermission'
  | 'notFound'
  | 'invalidDuration'
  | 'dmFailed';

export interface ModActionOutcome {
  ok: boolean;
  error?: ModActionError;
  detail?: string;
  case?: ModerationCase;
  dmSent?: boolean;
}

// ---------------------------------------------------------------------------
// Hierarchy & permission validation
// ---------------------------------------------------------------------------

export interface TargetResolution {
  member: GuildMember | null;
  /** The acting human moderator; null when the bot itself (automod/escalation) acts. */
  actorMember: GuildMember | null;
}

export async function resolveTarget(
  guild: Guild,
  targetId: string,
  actorMember: GuildMember | null,
): Promise<{ ok: true; target: TargetResolution } | { ok: false; error: ModActionError }> {
  const me = guild.members.me;
  if (!me) return { ok: false, error: 'botPermission' };
  if (targetId === me.id) return { ok: false, error: 'targetIsBot' };
  if (actorMember && actorMember.id === targetId) return { ok: false, error: 'self' };

  const member = await guild.members.fetch(targetId).catch(() => null);
  if (member) {
    // Nobody but the owner can be moderated above them.
    if (member.id === guild.ownerId && actorMember?.id !== guild.ownerId) {
      return { ok: false, error: 'hierarchy' };
    }
    if (actorMember && !canActOnMember(
      actorMember.roles.highest.position,
      member.roles.highest.position,
      actorMember.id === guild.ownerId,
    )) {
      return { ok: false, error: 'hierarchy' };
    }
    if (!canActOnMember(me.roles.highest.position, member.roles.highest.position, false)) {
      return { ok: false, error: 'botHierarchy' };
    }
  }
  return { ok: true, target: { member, actorMember } };
}

function botHas(guild: Guild, bit: bigint): boolean {
  return guild.members.me?.permissions.has(bit) ?? false;
}

/** Human-readable channel reference for embed text ("#name" or the raw id). */
function channelLabel(channel: TextBasedChannel): string {
  const named = channel as { name?: unknown };
  return typeof named.name === 'string' && named.name.length > 0 ? named.name : channel.id;
}

// ---------------------------------------------------------------------------
// Case management
// ---------------------------------------------------------------------------

export async function nextCaseNumber(guildId: string): Promise<number> {
  await getGuildSettings(guildId);
  const settings = await prisma.guildSettings.update({
    where: { guildId },
    data: { modCaseCount: { increment: 1 } },
    select: { modCaseCount: true },
  });
  return settings.modCaseCount;
}

export interface CreateCaseParams {
  guildId: string;
  type: CaseType;
  targetUserId: string;
  moderatorId?: string | null;
  reason: string;
  durationMinutes?: number | null;
  evidence?: string[];
}

export async function createCase(params: CreateCaseParams): Promise<ModerationCase> {
  await prisma.user.upsert({ where: { id: params.targetUserId }, create: { id: params.targetUserId }, update: {} });
  if (params.moderatorId) {
    await prisma.user.upsert({ where: { id: params.moderatorId }, create: { id: params.moderatorId }, update: {} });
  }
  const caseNumber = await nextCaseNumber(params.guildId);
  return prisma.moderationCase.create({
    data: {
      guildId: params.guildId,
      caseNumber,
      type: params.type,
      targetUserId: params.targetUserId,
      moderatorId: params.moderatorId ?? null,
      reason: truncate(params.reason, 1000),
      durationMinutes: params.durationMinutes ?? null,
      evidence: params.evidence ?? [],
    },
  });
}

export async function getCaseByNumber(guildId: string, caseNumber: number) {
  return prisma.moderationCase.findUnique({
    where: { guildId_caseNumber: { guildId, caseNumber } },
    include: { appeal: true },
  });
}

export async function getCaseHistory(guildId: string, targetUserId: string, limit = 10): Promise<ModerationCase[]> {
  return prisma.moderationCase.findMany({
    where: { guildId, targetUserId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function countActiveWarnings(guildId: string, userId: string): Promise<number> {
  return prisma.warning.count({ where: { guildId, userId, active: true } });
}

/** Deactivate open cases of the given types (e.g. BAN cases after an unban). */
export async function closeActiveCases(
  guildId: string,
  targetUserId: string,
  types: CaseType[],
): Promise<void> {
  await prisma.moderationCase.updateMany({
    where: { guildId, targetUserId, type: { in: types }, active: true },
    data: { active: false, resolvedAt: new Date() },
  });
}

async function writeAudit(action: string, guildId: string, moderatorId: string | null, targetId: string, metadata: Record<string, unknown>): Promise<void> {
  await prisma.auditLog
    .create({
      data: {
        actorType: moderatorId ? 'USER' : 'BOT',
        actorId: moderatorId,
        guildId,
        action,
        targetType: 'USER',
        targetId,
        metadata: toJson(metadata),
      },
    })
    .catch(() => undefined);
}

// ---------------------------------------------------------------------------
// DM notification
// ---------------------------------------------------------------------------

async function sendModDM(
  guild: Guild,
  targetUserId: string,
  title: string,
  reason: string,
  fields: { name: string; value: string; inline?: boolean }[],
): Promise<boolean> {
  const { client } = getContext();
  try {
    const user = await client.users.fetch(targetUserId);
    await user.send({
      embeds: [
        errorEmbed(`You received a moderation action in **${guild.name}**.`)
          .setTitle(title)
          .addFields({ name: 'Reason', value: truncate(reason, 1000) }, ...fields)
          .setTimestamp(new Date()),
      ],
    });
    return true;
  } catch {
    return false; // DMs closed — not an error.
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function finalizeCaseLog(
  guild: Guild,
  modCase: ModerationCase,
  action: string,
  extra: Record<string, unknown>,
): Promise<void> {
  const settings = await getGuildSettings(guild.id);
  await logModeration(guild, {
    action: `${modCase.type} (case #${modCase.caseNumber})`,
    actorId: modCase.moderatorId ?? getContext().client.user?.id ?? null,
    targetId: modCase.targetUserId,
    content: modCase.reason,
    fallbackChannelId: settings.modLogChannelId,
    metadata: { caseNumber: modCase.caseNumber, type: modCase.type, ...extra },
    title: `Moderation — ${modCase.type}`,
  });
  await writeAudit(`moderation.${action}`, guild.id, modCase.moderatorId, modCase.targetUserId, {
    caseNumber: modCase.caseNumber,
    type: modCase.type,
  });
  await incrementAnalytics(guild.id, { modActions: 1 });
}

export interface WarnParams {
  guild: Guild;
  targetId: string;
  moderator: GuildMember | null;
  reason: string;
  points?: number;
  dmNotify?: boolean;
}

export async function warnMember(params: WarnParams): Promise<ModActionOutcome> {
  const { guild } = params;
  const moderatorId = params.moderator?.id ?? getContext().client.user?.id ?? null;
  const resolution = await resolveTarget(guild, params.targetId, params.moderator);
  if (!resolution.ok) return { ok: false, error: resolution.error };

  const memberRow = await prisma.guildMember.findUnique({
    where: { userId_guildId: { userId: params.targetId, guildId: guild.id } },
    select: { id: true },
  });

  const modCase = await createCase({
    guildId: guild.id,
    type: 'WARN',
    targetUserId: params.targetId,
    moderatorId,
    reason: params.reason,
  });

  await prisma.warning.create({
    data: {
      caseId: modCase.id,
      guildId: guild.id,
      userId: params.targetId,
      memberId: memberRow?.id ?? null,
      moderatorId: moderatorId ?? '0',
      points: params.points ?? 1,
      reason: truncate(params.reason, 1000),
    },
  });

  let dmSent = false;
  if (params.dmNotify !== false) {
    dmSent = await sendModDM(guild, params.targetId, 'Warning', params.reason, [
      { name: 'Case', value: `#${modCase.caseNumber}`, inline: true },
    ]);
    if (dmSent) {
      await prisma.moderationCase.update({ where: { id: modCase.id }, data: { dmSent: true } });
    }
  }

  await finalizeCaseLog(guild, modCase, 'warn', { points: params.points ?? 1, dmSent });
  await enqueueWebhookEvent(guild.id, 'moderation.warn', {
    caseNumber: modCase.caseNumber,
    userId: params.targetId,
    moderatorId,
    reason: params.reason,
  });

  // Escalation engine — driven by GuildSettings.escalating.
  const escalation = await runEscalationIfDue(guild, params.targetId, params.moderator).catch((err) => {
    getContext().log.error({ err: serializeError(err) }, 'Escalation engine failed');
    return null;
  });

  return { ok: true, case: modCase, dmSent, detail: escalation ? `escalated:${escalation.action}` : undefined };
}

async function runEscalationIfDue(
  guild: Guild,
  targetUserId: string,
  actorMember: GuildMember | null,
): Promise<{ action: string } | null> {
  const settings = await getGuildSettings(guild.id);
  if (!settings.escalateOnWarn) return null;

  const parsed = escalationConfigSchema.safeParse(settings.escalating ?? undefined);
  if (!parsed.success || parsed.data.steps.length === 0) return null;

  const activeWarnings = await countActiveWarnings(guild.id, targetUserId);
  const dueSteps = parsed.data.steps
    .filter((step) => step.warnings <= activeWarnings)
    .sort((a, b) => b.warnings - a.warnings);
  const step = dueSteps[0];
  if (!step) return null;

  const botActorId = getContext().client.user?.id ?? null;
  const modCase = await createCase({
    guildId: guild.id,
    type: 'ESCALATION',
    targetUserId,
    moderatorId: actorMember?.id ?? botActorId,
    reason: `Escalation after ${activeWarnings} active warnings: ${step.action}`,
    durationMinutes: step.durationMinutes ?? null,
  });

  switch (step.action) {
    case 'timeout':
      if (step.durationMinutes) {
        await timeoutMember({
          guild,
          targetId: targetUserId,
          minutes: step.durationMinutes,
          reason: `Escalation: ${activeWarnings} warnings`,
          moderator: null,
        });
      }
      break;
    case 'kick':
      await kickMember({ guild, targetId: targetUserId, reason: `Escalation: ${activeWarnings} warnings`, moderator: null });
      break;
    case 'tempban':
      await tempbanMember({
        guild,
        targetId: targetUserId,
        durationMinutes: step.durationMinutes ?? 1440,
        reason: `Escalation: ${activeWarnings} warnings`,
        moderator: null,
      });
      break;
    case 'ban':
      await banMember({ guild, targetId: targetUserId, reason: `Escalation: ${activeWarnings} warnings`, moderator: null });
      break;
    default:
      break;
  }

  if (parsed.data.resetOnEscalate) {
    await prisma.warning.updateMany({
      where: { guildId: guild.id, userId: targetUserId, active: true },
      data: { active: false },
    });
  }

  await finalizeCaseLog(guild, modCase, 'escalation', { action: step.action, activeWarnings });
  return { action: step.action };
}

export interface TimeoutParams {
  guild: Guild;
  targetId: string;
  minutes: number;
  reason: string;
  moderator: GuildMember | null;
  dmNotify?: boolean;
}

export async function timeoutMember(params: TimeoutParams): Promise<ModActionOutcome> {
  const { guild } = params;
  if (params.minutes < 1 || params.minutes > MAX_TIMEOUT_MINUTES) {
    return { ok: false, error: 'invalidDuration', detail: `1 – ${MAX_TIMEOUT_MINUTES} minutes` };
  }
  if (!botHas(guild, PermissionFlagsBits.ModerateMembers)) return { ok: false, error: 'botPermission' };

  const resolution = await resolveTarget(guild, params.targetId, params.moderator);
  if (!resolution.ok) return { ok: false, error: resolution.error };
  const target = resolution.target.member;
  if (!target) return { ok: false, error: 'notFound' };
  if (target.user.bot) return { ok: false, error: 'targetIsBot', detail: 'Discord does not allow timing out bots' };

  const moderatorId = params.moderator?.id ?? getContext().client.user?.id ?? null;
  const modCase = await createCase({
    guildId: guild.id,
    type: 'TIMEOUT',
    targetUserId: params.targetId,
    moderatorId,
    reason: params.reason,
    durationMinutes: params.minutes,
  });

  try {
    await target.timeout(params.minutes * 60_000, truncate(params.reason, 400));
  } catch (err) {
    getContext().log.warn({ err: serializeError(err) }, 'Timeout API call failed');
    return { ok: false, error: 'botHierarchy', detail: 'Discord rejected the timeout' };
  }

  let dmSent = false;
  if (params.dmNotify !== false) {
    dmSent = await sendModDM(guild, params.targetId, 'Timeout', params.reason, [
      { name: 'Duration', value: formatDuration(params.minutes * 60_000), inline: true },
      { name: 'Case', value: `#${modCase.caseNumber}`, inline: true },
    ]);
  }

  await finalizeCaseLog(guild, modCase, 'timeout', { minutes: params.minutes, dmSent });
  await enqueueWebhookEvent(guild.id, 'moderation.timeout', {
    caseNumber: modCase.caseNumber, userId: params.targetId, moderatorId, minutes: params.minutes, reason: params.reason,
  });
  return { ok: true, case: modCase, dmSent };
}

export async function removeTimeout(
  guild: Guild,
  targetId: string,
  moderator: GuildMember | null,
  reason: string,
): Promise<ModActionOutcome> {
  const resolution = await resolveTarget(guild, targetId, moderator);
  if (!resolution.ok) return { ok: false, error: resolution.error };
  const target = resolution.target.member;
  if (!target) return { ok: false, error: 'notFound' };

  const moderatorId = moderator?.id ?? getContext().client.user?.id ?? null;
  const modCase = await createCase({
    guildId: guild.id,
    type: 'UNMUTE',
    targetUserId: targetId,
    moderatorId,
    reason,
  });
  await target.timeout(null, truncate(reason, 400)).catch((err: unknown) => {
    getContext().log.warn({ err: serializeError(err) }, 'Remove timeout failed');
  });
  await finalizeCaseLog(guild, modCase, 'untimeout', {});
  return { ok: true, case: modCase };
}

export interface KickParams {
  guild: Guild;
  targetId: string;
  reason: string;
  moderator: GuildMember | null;
  dmNotify?: boolean;
}

export async function kickMember(params: KickParams): Promise<ModActionOutcome> {
  const { guild } = params;
  if (!botHas(guild, PermissionFlagsBits.KickMembers)) return { ok: false, error: 'botPermission' };
  const resolution = await resolveTarget(guild, params.targetId, params.moderator);
  if (!resolution.ok) return { ok: false, error: resolution.error };
  const target = resolution.target.member;
  if (!target) return { ok: false, error: 'notFound' };

  const moderatorId = params.moderator?.id ?? getContext().client.user?.id ?? null;
  const modCase = await createCase({
    guildId: guild.id,
    type: 'KICK',
    targetUserId: params.targetId,
    moderatorId,
    reason: params.reason,
  });

  let dmSent = false;
  if (params.dmNotify !== false) {
    dmSent = await sendModDM(guild, params.targetId, 'Kicked', params.reason, [
      { name: 'Case', value: `#${modCase.caseNumber}`, inline: true },
    ]);
  }
  try {
    await target.kick(truncate(params.reason, 400));
  } catch (err) {
    getContext().log.warn({ err: serializeError(err) }, 'Kick API call failed');
    return { ok: false, error: 'botHierarchy', detail: 'Discord rejected the kick' };
  }
  await finalizeCaseLog(guild, modCase, 'kick', { dmSent });
  await enqueueWebhookEvent(guild.id, 'moderation.kick', {
    caseNumber: modCase.caseNumber, userId: params.targetId, moderatorId, reason: params.reason,
  });
  return { ok: true, case: modCase, dmSent };
}

export interface BanParams {
  guild: Guild;
  targetId: string;
  reason: string;
  moderator: GuildMember | null;
  deleteMessageSeconds?: number;
  dmNotify?: boolean;
}

export async function banMember(params: BanParams): Promise<ModActionOutcome> {
  const { guild } = params;
  if (!botHas(guild, PermissionFlagsBits.BanMembers)) return { ok: false, error: 'botPermission' };
  const resolution = await resolveTarget(guild, params.targetId, params.moderator);
  if (!resolution.ok) return { ok: false, error: resolution.error };

  const moderatorId = params.moderator?.id ?? getContext().client.user?.id ?? null;
  const modCase = await createCase({
    guildId: guild.id,
    type: 'BAN',
    targetUserId: params.targetId,
    moderatorId,
    reason: params.reason,
  });

  let dmSent = false;
  if (params.dmNotify !== false) {
    dmSent = await sendModDM(guild, params.targetId, 'Banned', params.reason, [
      { name: 'Case', value: `#${modCase.caseNumber}`, inline: true },
    ]);
  }
  try {
    await guild.members.ban(params.targetId, {
      reason: truncate(params.reason, 400),
      deleteMessageSeconds: params.deleteMessageSeconds,
    });
  } catch (err) {
    getContext().log.warn({ err: serializeError(err) }, 'Ban API call failed');
    return { ok: false, error: 'botHierarchy', detail: 'Discord rejected the ban' };
  }
  await finalizeCaseLog(guild, modCase, 'ban', { dmSent });
  await enqueueWebhookEvent(guild.id, 'moderation.ban', {
    caseNumber: modCase.caseNumber, userId: params.targetId, moderatorId, reason: params.reason,
  });
  return { ok: true, case: modCase, dmSent };
}

export async function tempbanMember(params: {
  guild: Guild;
  targetId: string;
  durationMinutes: number;
  reason: string;
  moderator: GuildMember | null;
  dmNotify?: boolean;
}): Promise<ModActionOutcome> {
  if (params.durationMinutes < 1) return { ok: false, error: 'invalidDuration' };
  const outcome = await banMember({ ...params, dmNotify: params.dmNotify });
  if (!outcome.ok || !outcome.case) return outcome;

  // Re-label the case as TEMPBAN and schedule the unban.
  const tempbanCase = await prisma.moderationCase.update({
    where: { id: outcome.case.id },
    data: { type: 'TEMPBAN', durationMinutes: params.durationMinutes },
  });
  await scheduleTask({
    guildId: params.guild.id,
    kind: 'TEMPBAN_EXPIRE',
    payload: { targetUserId: params.targetId, caseId: tempbanCase.id, caseNumber: tempbanCase.caseNumber },
    runAt: new Date(Date.now() + params.durationMinutes * 60_000),
  });
  return { ...outcome, case: tempbanCase };
}

export async function unbanMember(
  guild: Guild,
  targetId: string,
  moderator: GuildMember | null,
  reason: string,
): Promise<ModActionOutcome> {
  if (!botHas(guild, PermissionFlagsBits.BanMembers)) return { ok: false, error: 'botPermission' };
  const moderatorId = moderator?.id ?? getContext().client.user?.id ?? null;

  const banned = await guild.bans.fetch(targetId).catch(() => null);
  if (!banned) return { ok: false, error: 'notFound', detail: 'That user is not banned' };

  const modCase = await createCase({
    guildId: guild.id,
    type: 'UNBAN',
    targetUserId: targetId,
    moderatorId,
    reason,
  });
  try {
    await guild.members.unban(targetId, truncate(reason, 400));
  } catch (err) {
    getContext().log.warn({ err: serializeError(err) }, 'Unban API call failed');
    return { ok: false, error: 'botHierarchy', detail: 'Discord rejected the unban' };
  }
  await closeActiveCases(guild.id, targetId, ['BAN', 'TEMPBAN']);
  await finalizeCaseLog(guild, modCase, 'unban', {});
  await enqueueWebhookEvent(guild.id, 'moderation.unban', {
    caseNumber: modCase.caseNumber, userId: targetId, moderatorId, reason,
  });
  return { ok: true, case: modCase };
}

export async function softbanMember(params: {
  guild: Guild;
  targetId: string;
  reason: string;
  moderator: GuildMember | null;
  dmNotify?: boolean;
}): Promise<ModActionOutcome> {
  const outcome = await banMember({
    guild: params.guild,
    targetId: params.targetId,
    reason: params.reason,
    moderator: params.moderator,
    deleteMessageSeconds: 604_800, // purge last 7 days of the member's messages
    dmNotify: params.dmNotify,
  });
  if (!outcome.ok || !outcome.case) return outcome;

  const softbanCase = await prisma.moderationCase.update({
    where: { id: outcome.case.id },
    data: { type: 'SOFTBAN' },
  });
  await params.guild.members.unban(params.targetId, 'Softban cleanup').catch(() => undefined);
  await finalizeCaseLog(params.guild, softbanCase, 'softban', {});
  return { ...outcome, case: softbanCase };
}

export async function purgeMessages(params: {
  guild: Guild;
  channel: TextBasedChannel;
  count: number;
  moderatorId: string | null;
  filterUserId?: string | null;
}): Promise<ModActionOutcome> {
  const { guild, channel } = params;
  const me = guild.members.me;
  if (!me || !('bulkDelete' in channel)) return { ok: false, error: 'botPermission' };
  const count = Math.min(Math.max(params.count, 1), 500);

  let remaining = count;
  let cursor: string | undefined;
  let deleted = 0;
  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

  while (remaining > 0) {
    const messages = await channel.messages
      .fetch({ limit: Math.min(remaining, 100), before: cursor })
      .catch(() => null);
    if (!messages || messages.size === 0) break;
    const sorted = [...messages.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    cursor = sorted[sorted.length - 1]?.id;
    const deletable = sorted.filter((message) => {
      if (message.createdTimestamp < fourteenDaysAgo) return false; // bulk delete API limit
      if (params.filterUserId && message.author.id !== params.filterUserId) return false;
      return true;
    });
    if (deletable.length === 0) break;
    const toDelete = deletable.slice(0, remaining);
    await channel.bulkDelete(toDelete, true).catch(() => undefined);
    deleted += toDelete.length;
    remaining -= toDelete.length;
    if (sorted.length < Math.min(remaining + toDelete.length, 100)) break;
  }

  const modCase = await createCase({
    guildId: guild.id,
    type: 'PURGE',
    targetUserId: params.filterUserId ?? '0',
    moderatorId: params.moderatorId,
    reason: `Purged ${deleted} messages in #${channelLabel(channel)}`,
  });
  await finalizeCaseLog(guild, modCase, 'purge', { deleted, channelId: channel.id });
  return { ok: true, case: modCase, detail: String(deleted) };
}

export async function lockChannel(guild: Guild, channel: TextBasedChannel, moderatorId: string | null, reason: string): Promise<ModActionOutcome> {
  const me = guild.members.me;
  if (!me || !('permissionOverwrites' in channel)) return { ok: false, error: 'botPermission' };
  if (!me.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels)) {
    return { ok: false, error: 'botPermission' };
  }
  await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }, { reason: truncate(reason, 400) });
  const modCase = await createCase({
    guildId: guild.id,
    type: 'LOCKDOWN',
    targetUserId: '0',
    moderatorId,
    reason: `Locked #${channelLabel(channel)}: ${reason}`,
  });
  await logModeration(guild, {
    action: `Channel locked: #${channelLabel(channel)}`,
    actorId: moderatorId,
    eventChannelId: channel.id,
    metadata: { reason },
    fallbackChannelId: (await getGuildSettings(guild.id)).modLogChannelId,
    title: 'Channel locked',
  });
  return { ok: true, case: modCase };
}

export async function unlockChannel(guild: Guild, channel: TextBasedChannel, moderatorId: string | null, reason: string): Promise<ModActionOutcome> {
  const me = guild.members.me;
  if (!me || !('permissionOverwrites' in channel)) return { ok: false, error: 'botPermission' };
  if (!me.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels)) {
    return { ok: false, error: 'botPermission' };
  }
  await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }, { reason: truncate(reason, 400) });
  const modCase = await createCase({
    guildId: guild.id,
    type: 'LOCKDOWN',
    targetUserId: '0',
    moderatorId,
    reason: `Unlocked #${channelLabel(channel)}: ${reason}`,
  });
  await logModeration(guild, {
    action: `Channel unlocked: #${channelLabel(channel)}`,
    actorId: moderatorId,
    eventChannelId: channel.id,
    metadata: { reason },
    fallbackChannelId: (await getGuildSettings(guild.id)).modLogChannelId,
    title: 'Channel unlocked',
  });
  return { ok: true, case: modCase };
}

// ---------------------------------------------------------------------------
// Appeals
// ---------------------------------------------------------------------------

export type AppealResult = 'created' | 'duplicate' | 'noCase' | 'invalidCase' | 'ok' | 'alreadyResolved';

export async function createAppeal(
  guildId: string,
  caseNumber: number,
  userId: string,
  content: string,
): Promise<{ result: AppealResult; appeal?: Appeal }> {
  const modCase = await getCaseByNumber(guildId, caseNumber);
  if (!modCase) return { result: 'noCase' };
  if (modCase.targetUserId !== userId) return { result: 'invalidCase' };
  if (modCase.appeal) return { result: 'duplicate' };

  const appeal = await prisma.appeal.create({
    data: { caseId: modCase.id, content: truncate(content, 2000) },
  });
  return { result: 'created', appeal };
}

export async function resolveAppeal(
  guild: Guild,
  caseNumber: number,
  reviewerId: string,
  approve: boolean,
): Promise<{ result: AppealResult; appeal?: Appeal }> {
  const modCase = await getCaseByNumber(guild.id, caseNumber);
  if (!modCase) return { result: 'noCase' };
  if (!modCase.appeal) return { result: 'alreadyResolved' };
  if (modCase.appeal.status !== 'PENDING') return { result: 'alreadyResolved' };

  const appeal = await prisma.appeal.update({
    where: { id: modCase.appeal.id },
    data: { status: approve ? 'APPROVED' : 'DENIED', reviewedBy: reviewerId, reviewedAt: new Date() },
  });

  if (approve) {
    await closeActiveCases(guild.id, modCase.targetUserId, ['BAN', 'TEMPBAN']);
    await guild.members.unban(modCase.targetUserId, `Appeal approved for case #${caseNumber}`).catch(() => undefined);
    await prisma.moderationCase.update({
      where: { id: modCase.id },
      data: { active: false, resolvedAt: new Date() },
    }).catch(() => undefined);
  }

  await logModeration(guild, {
    action: `Appeal ${approve ? 'approved' : 'denied'} for case #${caseNumber}`,
    actorId: reviewerId,
    targetId: modCase.targetUserId,
    fallbackChannelId: (await getGuildSettings(guild.id)).modLogChannelId,
    title: 'Appeal resolved',
  });
  return { result: 'ok', appeal };
}

/** Map service errors to localized, user-facing messages. */
export function describeModError(outcome: ModActionOutcome, language = 'en', targetLabel = 'that member'): string {
  switch (outcome.error) {
    case 'self':
      return t('common.selfTarget', {}, language);
    case 'targetIsBot':
      return t('mod.cannotTimeoutBots', {}, language);
    case 'hierarchy':
      return t('common.hierarchyError', { target: targetLabel }, language);
    case 'botHierarchy':
      return t('common.botHierarchyError', { target: targetLabel }, language);
    case 'botPermission':
      return t('common.botNoPermission', {}, language);
    case 'notFound':
      return t('common.notFound', {}, language);
    case 'invalidDuration':
      return `${t('common.invalidDuration', {}, language)}${outcome.detail ? ` (${outcome.detail})` : ''}`;
    default:
      return t('common.errorOccurred', { id: 'N/A' }, language);
  }
}
