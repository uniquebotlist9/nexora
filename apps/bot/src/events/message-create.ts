import type { Message, PartialMessage } from 'discord.js';
import { prisma } from '@nexora/database';
import { toMessageOptions, brandEmbed } from '@nexora/discord';
import { serializeError } from '@nexora/logger';
import type { MessagePayload } from '@nexora/types';
import { getContext } from '../core/context';
import { safeJsonParse, truncate } from '../core/utils';
import { awardXp } from '../services/leveling';
import { runAutoModOnMessage } from '../services/automod';
import { dispatchAutomationTrigger } from '../services/automations';
import { recordTicketMessage } from '../services/tickets';
import { incrementAnalytics, trackActiveUser } from '../services/analytics';
import type { BotEvent } from '../framework/types';

async function handleAfk(message: Message<true>): Promise<void> {
  const guildId = message.guildId;

  // Returning members lose their AFK status.
  const own = await prisma.aFKStatus.findUnique({
    where: { guildId_userId: { guildId, userId: message.author.id } },
  });
  if (own) {
    await prisma.aFKStatus.delete({ where: { id: own.id } }).catch(() => undefined);
    await message
      .reply({ embeds: [brandEmbed().setDescription(`Welcome back <@${message.author.id}>, your AFK status was cleared.`)] })
      .catch(() => undefined);
    return;
  }

  // Mentioning an AFK member surfaces their status.
  for (const user of message.mentions.users.values()) {
    if (user.bot || user.id === message.author.id) continue;
    const status = await prisma.aFKStatus.findUnique({
      where: { guildId_userId: { guildId, userId: user.id } },
    });
    if (status) {
      await message
        .reply({
          embeds: [
            brandEmbed()
              .setColor(0xfee75c)
              .setDescription(`**${user.username}** is AFK: ${truncate(status.reason, 500)}\nSince <t:${Math.floor(status.since.getTime() / 1000)}:R>`),
          ],
        })
        .catch(() => undefined);
      return;
    }
  }
}

async function handleStickyMessage(message: Message<true>): Promise<void> {
  const sticky = await prisma.stickyMessage.findUnique({
    where: { guildId_channelId: { guildId: message.guildId, channelId: message.channelId } },
  });
  if (!sticky || !sticky.enabled) return;

  const nextCount = sticky.messageCount + 1;
  if (nextCount < sticky.interval) {
    await prisma.stickyMessage
      .update({ where: { id: sticky.id }, data: { messageCount: nextCount } })
      .catch(() => undefined);
    return;
  }

  // Re-stick: remove the previous pinned copy and post a fresh one.
  if (sticky.messageId) {
    const channel = message.channel;
    const old = await channel.messages.fetch(sticky.messageId).catch(() => null);
    if (old?.deletable) await old.delete().catch(() => undefined);
  }
  const payload = safeJsonParse<MessagePayload>(sticky.content);
  if (!payload) return;
  if (!message.channel.isSendable()) return;
  const posted = await message.channel.send(toMessageOptions(payload)).catch(() => null);
  await prisma.stickyMessage
    .update({ where: { id: sticky.id }, data: { messageCount: 0, messageId: posted?.id ?? null } })
    .catch(() => undefined);
}

export const messageCreateEvent: BotEvent<'messageCreate'> = {
  name: 'messageCreate',
  async execute(message: Message | PartialMessage) {
    if (message.partial || !message.inGuild() || message.author.bot || message.system) return;
    const { log, cache } = getContext();
    const guild = message.guild;

    await handleAfk(message).catch((err) => log.debug({ err: serializeError(err) }, 'AFK handling failed'));
    await handleStickyMessage(message).catch((err) => log.warn({ err: serializeError(err) }, 'Sticky message handling failed'));
    await recordTicketMessage(message).catch((err) => log.debug({ err: serializeError(err) }, 'Ticket transcript recording failed'));
    await awardXp(message).catch((err) => log.warn({ err: serializeError(err) }, 'XP award failed'));
    await runAutoModOnMessage(message).catch((err) => log.warn({ err: serializeError(err) }, 'AutoMod failed'));
    await dispatchAutomationTrigger(guild, 'MESSAGE_SENT', {
      userId: message.author.id,
      message,
      channel: message.channel,
      memberCount: guild.memberCount,
    }).catch((err) => log.debug({ err: serializeError(err) }, 'MESSAGE_SENT automation failed'));
    await dispatchAutomationTrigger(guild, 'KEYWORD_DETECTED', {
      userId: message.author.id,
      message,
      channel: message.channel,
    }).catch((err) => log.debug({ err: serializeError(err) }, 'KEYWORD_DETECTED automation failed'));

    await incrementAnalytics(guild.id, { messages: 1 }).catch(() => undefined);
    await trackActiveUser(guild.id, message.author.id, cache).catch(() => undefined);
  },
};
