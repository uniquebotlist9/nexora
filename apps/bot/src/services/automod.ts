import { PermissionFlagsBits, type Guild, type GuildMember, type Message, type PartialMessage } from 'discord.js';
import type { AutoModActionType, AutoModRuleType } from '@nexora/types';
import {
  prisma,
  type AutoModRule,
} from '@nexora/database';
import { autoModActionSchema, autoModTriggerSchema } from '@nexora/validation';
import { snowflakeToDate, warnEmbed } from '@nexora/discord';
import { serializeError } from '@nexora/logger';
import { getContext } from '../core/context';
import { getGuildSettings } from '../core/guilds';
import { sha256, toJson, truncate } from '../core/utils';
import { banMember, kickMember, timeoutMember, warnMember } from './moderation';
import { logEvent } from './logging';
import { enqueueWebhookEvent } from './webhooks';
import { incrementAnalytics } from './analytics';

type TriggerConfig = Partial<import('zod').z.infer<typeof autoModTriggerSchema>>;
type ActionConfig = import('zod').z.infer<typeof autoModActionSchema>;

const ruleCache = new Map<string, { rules: AutoModRule[]; expiresAt: number }>();
const RULE_CACHE_TTL_MS = 30_000;

export function invalidateAutoModRules(guildId: string): void {
  ruleCache.delete(guildId);
}

async function getEnabledRules(guildId: string): Promise<AutoModRule[]> {
  const cached = ruleCache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) return cached.rules;
  const rules = await prisma.autoModRule.findMany({
    where: { guildId, enabled: true },
  });
  ruleCache.set(guildId, { rules, expiresAt: Date.now() + RULE_CACHE_TTL_MS });
  return rules;
}

const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;
const INVITE_PATTERN = /(?:discord\.(?:gg|io|me|li)|discord(?:app)?\.com\/invite)\/[\w-]+/i;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/i;
const PHISHING_PATTERNS = [
  /free\s+(?:discord\s+)?nitro/i,
  /steam\s+gift/i,
  /airdrop\s+reward/i,
  /discord\s+nitro\s+(?: giveaway|for\s+free)/i,
  /login\s+to\s+claim/i,
];
const NSFW_WORDS = ['nsfw', 'porn', 'hentai', 'rule34', 'gore'];

function isExempt(message: Message, rule: AutoModRule): boolean {
  if (rule.exemptChannelIds.includes(message.channelId)) return true;
  const member = message.member;
  if (member && member.roles.cache.some((role) => rule.exemptRoleIds.includes(role.id))) return true;
  if (member?.permissions.has(PermissionFlagsBits.ManageMessages)) return true; // staff bypass
  return false;
}

async function windowCount(key: string, windowSeconds: number, increment: number): Promise<number> {
  const { cache } = getContext();
  let count = 0;
  // incrTtl counts by 1 per call; for mention-heavy messages we simply call it
  // per mention — cheap enough for the small numbers involved.
  for (let i = 0; i < increment; i += 1) {
    count = await cache.incrTtl(key, windowSeconds);
  }
  return count;
}

/** Evaluate one rule against a message. Returns a violation reason or null. */
async function checkRule(rule: AutoModRule, message: Message, trigger: TriggerConfig): Promise<string | null> {
  const { cache } = getContext();
  const content = message.content ?? '';
  const authorId = message.author.id;
  const guildId = message.guildId;

  switch (rule.type) {
    case 'SPAM': {
      const threshold = trigger.threshold ?? 5;
      const windowSeconds = trigger.windowSeconds ?? 5;
      const count = await cache.incrTtl(`automod:spam:${guildId}:${authorId}`, windowSeconds);
      return count > threshold ? `Sending messages too fast (${count}/${windowSeconds}s)` : null;
    }
    case 'FLOOD': {
      const threshold = trigger.threshold ?? 10;
      const windowSeconds = trigger.windowSeconds ?? 10;
      const count = await cache.incrTtl(`automod:flood:${guildId}:${authorId}`, windowSeconds);
      return count > threshold ? `Message flood (${count}/${windowSeconds}s)` : null;
    }
    case 'DUPLICATE': {
      const threshold = trigger.threshold ?? 3;
      const windowSeconds = trigger.windowSeconds ?? 30;
      if (!content) return null;
      const hash = sha256(content);
      const count = await cache.incrTtl(`automod:dup:${guildId}:${authorId}:${hash}`, windowSeconds);
      return count >= threshold ? 'Repeated identical messages' : null;
    }
    case 'MENTION_SPAM': {
      const threshold = trigger.threshold ?? 5;
      const windowSeconds = trigger.windowSeconds ?? 60;
      const count = await windowCount(
        `automod:mentions:${guildId}:${authorId}`,
        windowSeconds,
        Math.max(message.mentions.users.size, 1),
      );
      return count > threshold ? `Too many mentions (${count}/${windowSeconds}s)` : null;
    }
    case 'MASS_MENTION': {
      const threshold = trigger.threshold ?? 5;
      return message.mentions.users.size >= threshold
        ? `Mass mentioning (${message.mentions.users.size} users)`
        : null;
    }
    case 'EXCESSIVE_CAPS': {
      const percent = trigger.capsPercent ?? 70;
      const letters = content.replace(/[^a-zA-Z]/g, '');
      if (letters.length < 8) return null;
      const caps = content.replace(/[^A-Z]/g, '').length;
      return (caps / letters.length) * 100 >= percent ? 'Excessive caps' : null;
    }
    case 'EXCESSIVE_EMOJI': {
      const max = trigger.maxEmojis ?? 10;
      const count = [...content.matchAll(EMOJI_PATTERN)].length;
      return count > max ? `Excessive emoji (${count})` : null;
    }
    case 'INVITE': {
      const match = content.match(INVITE_PATTERN);
      if (!match) return null;
      const code = match[0].split('/').pop() ?? '';
      const whitelist = trigger.whitelist ?? [];
      if (whitelist.includes(code) || whitelist.some((entry) => match[0].toLowerCase().includes(entry.toLowerCase()))) {
        return null;
      }
      return 'Posting invite links';
    }
    case 'URL': {
      const match = content.match(URL_PATTERN);
      if (!match) return null;
      const whitelist = trigger.whitelist ?? [];
      if (whitelist.some((entry) => match[0].toLowerCase().includes(entry.toLowerCase()))) return null;
      return 'Posting links';
    }
    case 'PHISHING': {
      const hasUrl = URL_PATTERN.test(content);
      const phishing = PHISHING_PATTERNS.some((pattern) => pattern.test(content));
      const whitelist = trigger.whitelist ?? [];
      const whitelisted = whitelist.some((entry) => content.toLowerCase().includes(entry.toLowerCase()));
      return hasUrl && phishing && !whitelisted ? 'Suspicious phishing link' : null;
    }
    case 'BAD_WORDS': {
      const words = trigger.words ?? [];
      if (words.length === 0) return null;
      const haystack = trigger.caseSensitive ? content : content.toLowerCase();
      const found = words.find((word) => {
        const needle = trigger.caseSensitive ? word : word.toLowerCase();
        return haystack.includes(needle);
      });
      return found ? `Blocked word (${found})` : null;
    }
    case 'NSFW': {
      const words = trigger.words ?? NSFW_WORDS;
      const haystack = content.toLowerCase();
      const found = words.find((word) => haystack.includes(word.toLowerCase()));
      return found ? `NSFW content (${found})` : null;
    }
    case 'ACCOUNT_AGE': {
      const minHours = trigger.minAccountAgeHours ?? 24;
      const ageHours = (Date.now() - snowflakeToDate(authorId).getTime()) / 3_600_000;
      return ageHours < minHours ? `Account too new (${Math.floor(ageHours)}h < ${minHours}h)` : null;
    }
    case 'ATTACHMENT': {
      const max = trigger.maxAttachments ?? 5;
      return message.attachments.size > max ? `Too many attachments (${message.attachments.size})` : null;
    }
    case 'BOT_ABUSE': {
      const botId = getContext().client.user?.id;
      if (!botId || !message.mentions.has(botId)) return null;
      const threshold = trigger.threshold ?? 3;
      const windowSeconds = trigger.windowSeconds ?? 10;
      const count = await cache.incrTtl(`automod:botabuse:${guildId}:${authorId}`, windowSeconds);
      return count > threshold ? 'Spam-mentioning the bot' : null;
    }
    case 'RAID':
      // Raid detection is join-based and owned by services/antiraid.ts.
      return null;
    default:
      return null;
  }
}

async function alertModerators(guild: Guild, rule: AutoModRule, message: Message, violation: string): Promise<void> {
  const settings = await getGuildSettings(guild.id).catch(() => null);
  const channelId = settings?.modLogChannelId;
  if (!channelId) return;
  const channel = await getContext().client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isSendable()) return;
  await channel
    .send({
      embeds: [
        warnEmbed(
          `AutoMod rule **${rule.name}** (${rule.type}) was triggered by <@${message.author.id}> — ${violation}`,
        )
          .setTitle('AutoMod alert')
          .addFields(
            { name: 'Channel', value: `<#${message.channelId}>`, inline: true },
            { name: 'Rule', value: `${rule.name} (${rule.type})`, inline: true },
          )
          .setTimestamp(new Date()),
      ],
    })
    .catch(() => undefined);
}

async function executeRuleActions(rule: AutoModRule, message: Message, violation: string): Promise<void> {
  const guild = message.guild;
  if (!guild) return;
  const rawActions = Array.isArray(rule.actions) ? (rule.actions as unknown[]) : [];
  const botUserId = getContext().client.user?.id ?? null;

  // Delete first so the offending content disappears even if later actions fail.
  const wantsDelete = rawActions.some(
    (raw) => autoModActionSchema.safeParse(raw).success && (raw as { type?: string }).type === 'DELETE',
  );
  if (wantsDelete && message.deletable) {
    await message.delete().catch(() => undefined);
  }

  for (const raw of rawActions) {
    const parsed = autoModActionSchema.safeParse(raw);
    if (!parsed.success) continue;
    const action = parsed.data as ActionConfig;
    switch (action.type) {
      case 'DELETE':
        continue; // already handled above
      case 'WARN':
        await warnMember({
          guild,
          targetId: message.author.id,
          moderator: null,
          reason: `[AutoMod:${rule.name}] ${violation}`,
          points: action.points ?? 1,
        }).catch((err) => getContext().log.warn({ err: serializeError(err) }, 'AutoMod warn failed'));
        break;
      case 'TIMEOUT':
        await timeoutMember({
          guild,
          targetId: message.author.id,
          minutes: action.durationMinutes ?? 10,
          reason: `[AutoMod:${rule.name}] ${violation}`,
          moderator: null,
        }).catch((err) => getContext().log.warn({ err: serializeError(err) }, 'AutoMod timeout failed'));
        break;
      case 'KICK':
        await kickMember({
          guild,
          targetId: message.author.id,
          reason: `[AutoMod:${rule.name}] ${violation}`,
          moderator: null,
        }).catch((err) => getContext().log.warn({ err: serializeError(err) }, 'AutoMod kick failed'));
        break;
      case 'BAN':
        await banMember({
          guild,
          targetId: message.author.id,
          reason: `[AutoMod:${rule.name}] ${violation}`,
          moderator: null,
        }).catch((err) => getContext().log.warn({ err: serializeError(err) }, 'AutoMod ban failed'));
        break;
      case 'ADD_ROLE':
      case 'REMOVE_ROLE': {
        if (!action.roleId || !message.member) break;
        const role = guild.roles.cache.get(action.roleId);
        const me = guild.members.me;
        if (!role || !me?.permissions.has(PermissionFlagsBits.ManageRoles)) break;
        if (role.position >= me.roles.highest.position) break;
        if (action.type === 'ADD_ROLE') {
          await message.member.roles.add(role, `[AutoMod:${rule.name}]`).catch(() => undefined);
        } else {
          await message.member.roles.remove(role, `[AutoMod:${rule.name}]`).catch(() => undefined);
        }
        break;
      }
      case 'ALERT_MODS':
        await alertModerators(guild, rule, message, violation);
        break;
      default:
        break;
    }
  }

  await prisma.autoModRule
    .update({
      where: { id: rule.id },
      data: { strikeCount: { increment: 1 }, lastTriggeredAt: new Date() },
    })
    .catch(() => undefined);

  await prisma.logEvent
    .create({
      data: {
        guildId: guild.id,
        category: 'automod',
        action: `${rule.type}:${violation}`,
        actorId: botUserId,
        targetId: message.author.id,
        content: truncate(message.content ?? '', 500),
        metadata: toJson({ ruleId: rule.id, ruleName: rule.name, channel: message.channelId }),
      },
    })
    .catch(() => undefined);

  await prisma.auditLog
    .create({
      data: {
        actorType: 'BOT',
        actorId: botUserId,
        guildId: guild.id,
        action: 'automod.triggered',
        targetType: 'RULE',
        targetId: rule.id,
        metadata: toJson({ userId: message.author.id, violation }),
      },
    })
    .catch(() => undefined);

  await logEvent(guild, 'automod', {
    action: `Rule "${rule.name}" triggered: ${violation}`,
    actorId: message.author.id,
    eventChannelId: message.channelId,
    metadata: { rule: rule.name, type: rule.type },
    title: 'AutoMod triggered',
  });

  await enqueueWebhookEvent(guild.id, 'automod.triggered', {
    ruleId: rule.id,
    ruleName: rule.name,
    type: rule.type,
    userId: message.author.id,
    violation,
  });

  const punished = rawActions.some((raw) => {
    const type = (raw as { type?: string }).type;
    return type === 'WARN' || type === 'TIMEOUT' || type === 'KICK' || type === 'BAN';
  });
  if (punished) {
    await incrementAnalytics(guild.id, { modActions: 1 });
  }
}

/**
 * Run the full AutoMod pipeline for a (non-bot) guild message.
 * At most one rule violation is enforced per message to avoid double punishment.
 */
export async function runAutoModOnMessage(message: Message | PartialMessage): Promise<void> {
  if (!message.inGuild()) return;
  const full = message.partial ? await message.fetch().catch(() => null) : message;
  if (!full || full.author.bot || !full.guild) return;

  const guild = full.guild;
  let member: GuildMember | null = full.member;
  if (!member) {
    member = await guild.members.fetch(full.author.id).catch(() => null);
  }

  try {
    const rules = await getEnabledRules(guild.id);
    for (const rule of rules) {
      if (isExempt(full, rule)) continue;
      const triggerParsed = autoModTriggerSchema.safeParse(rule.trigger ?? {});
      const trigger: TriggerConfig = triggerParsed.success ? triggerParsed.data : {};
      const violation = await checkRule(rule, full, trigger);
      if (violation) {
        await executeRuleActions(rule, full, violation);
        return; // one violation per message is enough
      }
    }
  } catch (err) {
    getContext().log.error({ err: serializeError(err), guildId: guild.id }, 'AutoMod pipeline failed');
  }
}
