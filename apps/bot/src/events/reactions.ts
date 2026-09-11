import type { MessageReaction, PartialUser, User } from 'discord.js';
import { prisma } from '@nexora/database';
import { brandEmbed } from '@nexora/discord';
import { getContext } from '../core/context';
import { truncate } from '../core/utils';
import { handleReactionRoleReaction } from '../services/reaction-roles';
import { handleVerificationReaction } from '../services/verification';
import type { BotEvent } from '../framework/types';

function emojiKey(reaction: MessageReaction): string {
  return reaction.emoji.id ?? reaction.emoji.name ?? '';
}

async function countStars(reaction: MessageReaction, excludeUserId: string | null): Promise<number> {
  const messageReaction = reaction.message.reactions.cache.find(
    (entry) => (entry.emoji.id ?? entry.emoji.name ?? '') === emojiKey(reaction),
  );
  if (!messageReaction) return 0;
  if (!excludeUserId) return messageReaction.count;
  const users = await messageReaction.users.fetch().catch(() => null);
  if (!users) return messageReaction.count;
  return users.filter((user) => user.id !== excludeUserId && !user.bot).size;
}

async function handleStarboard(reaction: MessageReaction, user: User | PartialUser, added: boolean): Promise<void> {
  const message = reaction.message.partial ? await reaction.message.fetch().catch(() => null) : reaction.message;
  if (!message || !message.inGuild()) return;
  const guild = message.guild;

  const config = await prisma.starboardConfig.findUnique({ where: { guildId: guild.id } });
  if (!config?.enabled || !config.channelId) return;
  if (message.channelId === config.channelId) return;
  if (config.ignoreBots && message.author.bot) return;
  if (emojiKey(reaction) !== config.emoji) return;

  const count = await countStars(reaction, config.selfStar ? null : message.author.id);
  const channel = await getContext().client.channels.fetch(config.channelId).catch(() => null);
  if (!channel?.isSendable()) return;

  const entry = await prisma.starboardEntry.findUnique({
    where: { guildId_sourceMessageId: { guildId: guild.id, sourceMessageId: message.id } },
  });

  if (count < config.threshold) {
    // Below threshold: drop the starred copy if one exists.
    if (entry?.starboardMessageId && !added) {
      const starMessage = await channel.messages.fetch(entry.starboardMessageId).catch(() => null);
      if (starMessage?.deletable) await starMessage.delete().catch(() => undefined);
      await prisma.starboardEntry.delete({ where: { id: entry.id } }).catch(() => undefined);
    } else if (entry) {
      await prisma.starboardEntry.update({ where: { id: entry.id }, data: { starCount: count } }).catch(() => undefined);
    }
    return;
  }

  if (entry) {
    await prisma.starboardEntry.update({ where: { id: entry.id }, data: { starCount: count } }).catch(() => undefined);
    if (entry.starboardMessageId) {
      const starMessage = await channel.messages.fetch(entry.starboardMessageId).catch(() => null);
      await starMessage
        ?.edit({ content: `${config.emoji} **${count}**` })
        .catch(() => undefined);
    }
    return;
  }

  const embed = brandEmbed()
    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
    .setDescription(truncate(message.content || '(no text content)', 1024))
    .addFields({ name: 'Source', value: `[Jump to message](${message.url})` })
    .setTimestamp(message.createdAt);
  const attachment = [...message.attachments.values()][0];
  if (attachment?.contentType?.startsWith('image/')) embed.setImage(attachment.url);

  const posted = await channel
    .send({ content: `${config.emoji} **${count}**`, embeds: [embed] })
    .catch(() => null);
  await prisma.starboardEntry
    .create({
      data: {
        guildId: guild.id,
        configId: config.id,
        sourceMessageId: message.id,
        sourceChannelId: message.channelId,
        authorId: message.author.id,
        starboardMessageId: posted?.id ?? null,
        starCount: count,
      },
    })
    .catch(() => undefined);
}

export const messageReactionAddEvent: BotEvent<'messageReactionAdd'> = {
  name: 'messageReactionAdd',
  async execute(reaction: MessageReaction, user: User | PartialUser) {
    if (user.bot) return;
    const guild = reaction.message.guild;
    if (!guild) return;

    await handleStarboard(reaction, user, true).catch(() => undefined);
    await handleReactionRoleReaction(guild, reaction.message.id, emojiKey(reaction), user.id, true).catch(() => undefined);
    await handleVerificationReaction(guild, reaction.message.id, reaction.emoji.name ?? '', user.id).catch(() => undefined);
  },
};

export const messageReactionRemoveEvent: BotEvent<'messageReactionRemove'> = {
  name: 'messageReactionRemove',
  async execute(reaction: MessageReaction, user: User | PartialUser) {
    if (user.bot) return;
    const guild = reaction.message.guild;
    if (!guild) return;

    await handleStarboard(reaction, user, false).catch(() => undefined);
    await handleReactionRoleReaction(guild, reaction.message.id, emojiKey(reaction), user.id, false).catch(() => undefined);
  },
};
