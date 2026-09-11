import type { Message, PartialMessage } from 'discord.js';
import { prisma } from '@nexora/database';
import { getContext } from '../core/context';
import { truncate } from '../core/utils';
import { logEvent } from '../services/logging';
import type { BotEvent } from '../framework/types';

export const messageDeleteEvent: BotEvent<'messageDelete'> = {
  name: 'messageDelete',
  async execute(message: Message | PartialMessage) {
    const guild = message.guild;
    if (!guild) return;
    const author = message.author;
    const content = message.partial ? null : message.content;

    await logEvent(guild, 'messageDelete', {
      action: 'Message deleted',
      actorId: author?.id ?? null,
      targetId: author?.id ?? null,
      content,
      eventChannelId: message.channelId,
      metadata: { messageId: message.id, hadAttachments: !message.partial && message.attachments.size > 0 },
    });

    // Starboard cleanup: remove the starred copy when the source is deleted.
    const entry = await prisma.starboardEntry.findUnique({
      where: { guildId_sourceMessageId: { guildId: guild.id, sourceMessageId: message.id } },
    });
    if (entry?.starboardMessageId) {
      const config = await prisma.starboardConfig.findUnique({ where: { guildId: guild.id } });
      if (config?.channelId) {
        const channel = await getContext().client.channels.fetch(config.channelId).catch(() => null);
        if (channel?.isTextBased()) {
          const starMessage = await channel.messages.fetch(entry.starboardMessageId).catch(() => null);
          if (starMessage?.deletable) await starMessage.delete().catch(() => undefined);
        }
      }
      await prisma.starboardEntry.delete({ where: { id: entry.id } }).catch(() => undefined);
    }
  },
};

export const messageUpdateEvent: BotEvent<'messageUpdate'> = {
  name: 'messageUpdate',
  async execute(oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) {
    const guild = newMessage.guild;
    if (!guild) return;
    if (newMessage.partial) return;
    if (newMessage.author.bot) return;

    const oldContent = oldMessage.partial ? null : oldMessage.content;
    if (oldContent === newMessage.content) return; // embed loads etc.

    await logEvent(guild, 'messageEdit', {
      action: 'Message edited',
      actorId: newMessage.author.id,
      eventChannelId: newMessage.channelId,
      content: truncate(newMessage.content || '(empty)', 500),
      metadata: {
        messageId: newMessage.id,
        before: truncate(oldContent || '(unknown)', 500),
        after: truncate(newMessage.content || '(empty)', 500),
      },
    });
  },
};
