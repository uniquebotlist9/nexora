import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { prisma } from '@nexora/database';
import { brandEmbed, successEmbed, warnEmbed } from '@nexora/discord';
import { guildCommand } from '../../framework/builders';
import type { BotCommand } from '../../framework/types';
import { toJson } from '../../core/utils';
import { scheduleTask } from '../../services/task-queue';

export const stickyCommand: BotCommand = {
  data: guildCommand('sticky', 'Manage sticky channel messages', PermissionFlagsBits.ManageChannels)
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Post a sticky message in a channel')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('Channel').setRequired(true).addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) => option.setName('description').setDescription('Sticky message text').setRequired(true).setMaxLength(2000))
        .addIntegerOption((option) =>
          option.setName('interval').setDescription('Re-post after N messages').setRequired(false).setMinValue(2).setMaxValue(100),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove the sticky message from a channel')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('Channel').setRequired(true).addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('List sticky messages')),
  category: 'config',
  async execute(ctx) {
    const { interaction, guild } = ctx;
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel', true);
      const description = interaction.options.getString('description', true);
      const interval = interaction.options.getInteger('interval') ?? 10;

      // Remove any previous sticky message first.
      const existing = await prisma.stickyMessage.findUnique({
        where: { guildId_channelId: { guildId: guild.id, channelId: channel.id } },
      });
      if (existing?.messageId) {
        const textChannel = await guild.channels.fetch(channel.id).catch(() => null);
        const old = textChannel?.isTextBased()
          ? await textChannel.messages.fetch(existing.messageId).catch(() => null)
          : null;
        if (old?.deletable) await old.delete().catch(() => undefined);
      }

      const payload = toJson({ embed: { title: '📌 Notice', description, color: 0x5865f2 } });
      const textChannel = await guild.channels.fetch(channel.id).catch(() => null);
      if (!textChannel?.isSendable()) {
        await interaction.editReply({ content: '', embeds: [warnEmbed('I cannot send messages in that channel.')] });
        return;
      }
      const posted = await textChannel.send({ embeds: [brandEmbed().setTitle('📌 Notice').setDescription(description)] }).catch(() => null);

      await prisma.stickyMessage.upsert({
        where: { guildId_channelId: { guildId: guild.id, channelId: channel.id } },
        create: {
          guildId: guild.id,
          channelId: channel.id,
          content: payload,
          messageId: posted?.id ?? null,
          interval,
        },
        update: { content: payload, messageId: posted?.id ?? null, interval, messageCount: 0, enabled: true },
      });
      await interaction.editReply({ content: '', embeds: [successEmbed(`Sticky message set in <#${channel.id}> (re-posts every **${interval}** messages).`)] });
      return;
    }

    if (sub === 'remove') {
      const channel = interaction.options.getChannel('channel', true);
      const existing = await prisma.stickyMessage.findUnique({
        where: { guildId_channelId: { guildId: guild.id, channelId: channel.id } },
      });
      if (!existing) {
        await interaction.editReply({ content: '', embeds: [warnEmbed('That channel has no sticky message.')] });
        return;
      }
      if (existing.messageId) {
        const textChannel = await guild.channels.fetch(channel.id).catch(() => null);
        const old = textChannel?.isTextBased()
          ? await textChannel.messages.fetch(existing.messageId).catch(() => null)
          : null;
        if (old?.deletable) await old.delete().catch(() => undefined);
      }
      await prisma.stickyMessage.delete({ where: { id: existing.id } });
      await interaction.editReply({ content: '', embeds: [successEmbed(`Sticky message removed from <#${channel.id}>.`)] });
      return;
    }

    // list
    const stickies = await prisma.stickyMessage.findMany({ where: { guildId: guild.id }, take: 15 });
    await interaction.editReply({
      content: '',
      embeds: [
        brandEmbed()
          .setTitle('Sticky messages')
          .setDescription(
            stickies.length === 0
              ? 'None configured.'
              : stickies.map((sticky) => `<#${sticky.channelId}> — every **${sticky.interval}** messages ${sticky.enabled ? '' : '(disabled)'}`).join('\n'),
          ),
      ],
    });
  },
};

/**
 * `/automessage` — recurring auto-messages backed by SCHEDULED automations.
 * This is a thin, slash-friendly wrapper around the automation engine (full
 * automation building happens on the dashboard).
 */
export const automessageCommand: BotCommand = {
  data: guildCommand('automessage', 'Manage recurring auto-messages', PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Post a message on a recurring schedule')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('Target channel').setRequired(true).addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) => option.setName('content').setDescription('Message text').setRequired(true).setMaxLength(1500))
        .addIntegerOption((option) =>
          option.setName('interval_minutes').setDescription('How often to post (minutes)').setRequired(true).setMinValue(5).setMaxValue(10080),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete an auto-message')
        .addStringOption((option) => option.setName('name').setDescription('Auto-message name (see /automessage list)').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('List recurring auto-messages')),
  category: 'config',
  async execute(ctx) {
    const { interaction, guild } = ctx;
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const channel = interaction.options.getChannel('channel', true);
      const content = interaction.options.getString('content', true);
      const intervalMinutes = interaction.options.getInteger('interval_minutes', true);

      const existing = await prisma.automation.findFirst({
        where: { guildId: guild.id, trigger: 'SCHEDULED', name: { startsWith: 'automessage:' } },
      });
      const suffix = existing ? `-${Date.now().toString(36).slice(-4)}` : '';
      const name = `automessage:${channel.id}${suffix}`.slice(0, 100);

      const automation = await prisma.automation.create({
        data: {
          guildId: guild.id,
          name,
          trigger: 'SCHEDULED',
          triggerConfig: toJson({ intervalMinutes }),
          actions: JSON.parse(JSON.stringify([
            { type: 'SEND_MESSAGE', config: { channelId: channel.id, message: { content } } },
          ])),
        },
      });
      await scheduleTask({
        guildId: guild.id,
        kind: 'AUTOMATION',
        payload: { automationId: automation.id },
        runAt: new Date(Date.now() + intervalMinutes * 60_000),
      });
      await interaction.reply({
        embeds: [successEmbed(`Auto-message created — posting to <#${channel.id}> every **${intervalMinutes}m**.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'delete') {
      const name = interaction.options.getString('name', true);
      const deleted = await prisma.automation.deleteMany({
        where: { guildId: guild.id, name: { contains: name }, trigger: 'SCHEDULED' },
      });
      await interaction.reply({
        embeds: [deleted.count > 0 ? successEmbed('Auto-message deleted.') : warnEmbed('No matching auto-message found.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // list
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const automations = await prisma.automation.findMany({
      where: { guildId: guild.id, trigger: 'SCHEDULED', name: { startsWith: 'automessage:' } },
      take: 15,
    });
    await interaction.editReply({
      content: '',
      embeds: [
        brandEmbed()
          .setTitle('Recurring auto-messages')
          .setDescription(
            automations.length === 0
              ? 'None configured.'
              : automations.map((automation) => `\`${automation.name}\` — ${automation.enabled ? 'enabled' : 'disabled'}`).join('\n'),
          ),
      ],
    });
  },
};
