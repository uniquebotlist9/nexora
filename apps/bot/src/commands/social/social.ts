import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { prisma } from '@nexora/database';
import { brandEmbed, successEmbed, warnEmbed } from '@nexora/discord';
import { guildCommand } from '../../framework/builders';
import type { BotCommand } from '../../framework/types';
import { scheduleTask } from '../../services/task-queue';

const POLL_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

export const pollCommand: BotCommand = {
  data: guildCommand('poll', 'Create a reaction poll')
    .addStringOption((option) => option.setName('question').setDescription('Poll question').setRequired(true).setMaxLength(256))
    .addStringOption((option) =>
      option.setName('options').setDescription('Comma-separated options (2-10), e.g. "Pizza, Sushi, Burgers"').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('duration').setDescription('Poll duration (e.g. 1h, 1d). Optional — poll stays open without it.').setRequired(false),
    ),
  category: 'social',
  cooldownSeconds: 10,
  async execute(ctx) {
    const { interaction, guild } = ctx;
    const question = interaction.options.getString('question', true);
    const rawOptions = interaction.options.getString('options', true)
      .split(',')
      .map((option) => option.trim())
      .filter((option) => option.length > 0)
      .slice(0, 10);
    if (rawOptions.length < 2) {
      await interaction.reply({ embeds: [warnEmbed('A poll needs at least 2 options.')], flags: MessageFlags.Ephemeral });
      return;
    }

    const embed = brandEmbed()
      .setTitle(`📊 ${question}`)
      .setDescription(rawOptions.map((option, index) => `${POLL_EMOJIS[index]} ${option}`).join('\n'))
      .setFooter({ text: `Poll by ${interaction.user.tag}` });
    const channel = interaction.channel;
    const message = channel?.isSendable()
      ? await channel.send({ embeds: [embed] }).catch(() => null)
      : null;
    if (!message) {
      await interaction.reply({ embeds: [warnEmbed('I could not post the poll here.')], flags: MessageFlags.Ephemeral });
      return;
    }
    for (let i = 0; i < rawOptions.length; i += 1) {
      await message.react(POLL_EMOJIS[i]).catch(() => undefined);
    }
    await interaction.reply({ embeds: [successEmbed('Poll created.')], flags: MessageFlags.Ephemeral });

    const durationInput = interaction.options.getString('duration');
    if (durationInput) {
      const { parseDurationMinutes } = await import('../../core/utils');
      const minutes = parseDurationMinutes(durationInput);
      if (minutes !== null && minutes > 0) {
        await scheduleTask({
          guildId: guild.id,
          kind: 'POLL_END',
          payload: { channelId: message.channelId, messageId: message.id, question, optionCount: rawOptions.length },
          runAt: new Date(Date.now() + minutes * 60_000),
        });
      }
    }
  },
};

export const suggestionCommand: BotCommand = {
  data: guildCommand('suggestion', 'Submit or manage suggestions')
    .addSubcommand((sub) =>
      sub
        .setName('submit')
        .setDescription('Submit a suggestion')
        .addStringOption((option) => option.setName('content').setDescription('Your suggestion').setRequired(true).setMaxLength(1500)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('Set a suggestion status (staff)')
        .addStringOption((option) => option.setName('id').setDescription('Suggestion ID').setRequired(true))
        .addStringOption((option) =>
          option
            .setName('state')
            .setDescription('New status')
            .setRequired(true)
            .addChoices(
              { name: 'approved', value: 'APPROVED' },
              { name: 'denied', value: 'DENIED' },
              { name: 'implemented', value: 'IMPLEMENTED' },
            ),
        ),
    )
    .addSubcommand((sub) => sub.setName('channel').setDescription('Set the suggestions channel (staff)').addChannelOption((option) =>
      option.setName('target').setDescription('Channel for suggestions').setRequired(true),
    )),
  category: 'social',
  cooldownSeconds: 10,
  async execute(ctx) {
    const { interaction, guild } = ctx;
    const sub = interaction.options.getSubcommand();

    if (sub === 'submit') {
      const content = interaction.options.getString('content', true);
      const config = await prisma.suggestionConfig.findUnique({ where: { guildId: guild.id } });
      if (!config?.enabled || !config.channelId) {
        await interaction.reply({
          embeds: [warnEmbed('Suggestions are not enabled on this server. An admin can enable them with /suggestion channel.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const channel = await guild.channels.fetch(config.channelId).catch(() => null);
      if (!channel?.isSendable()) {
        await interaction.reply({ embeds: [warnEmbed('The suggestions channel is unavailable.')], flags: MessageFlags.Ephemeral });
        return;
      }
      const embed = brandEmbed()
        .setTitle('💡 New suggestion')
        .setDescription(content)
        .setFooter({ text: `Suggested by ${interaction.user.tag}` })
        .setTimestamp(new Date());
      const message = await channel.send({ embeds: [embed] }).catch(() => null);
      if (!message) {
        await interaction.reply({ embeds: [warnEmbed('Could not post the suggestion.')], flags: MessageFlags.Ephemeral });
        return;
      }
      await message.react(config.upvoteEmoji).catch(() => undefined);
      await message.react(config.downvoteEmoji).catch(() => undefined);
      await prisma.suggestion.create({
        data: {
          guildId: guild.id,
          configId: config.id,
          userId: interaction.user.id,
          content,
          messageId: message.id,
        },
      });
      await interaction.reply({ embeds: [successEmbed('Suggestion submitted — thank you!')] , flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'status') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ embeds: [warnEmbed(ctx.t('common.noPermission'))], flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const id = interaction.options.getString('id', true);
      const state = interaction.options.getString('state', true);
      const suggestion = await prisma.suggestion.findFirst({
        where: { guildId: guild.id, OR: [{ id }, { messageId: id }] },
      });
      if (!suggestion?.messageId) {
        await interaction.editReply({ content: '', embeds: [warnEmbed('Suggestion not found.')] });
        return;
      }
      await prisma.suggestion.update({ where: { id: suggestion.id }, data: { status: state } });
      const config = await prisma.suggestionConfig.findUnique({ where: { guildId: guild.id } });
      const channel = config?.channelId ? await guild.channels.fetch(config.channelId).catch(() => null) : null;
      const message = channel?.isTextBased() ? await channel.messages.fetch(suggestion.messageId).catch(() => null) : null;
      const color = state === 'APPROVED' ? 0x57f287 : state === 'DENIED' ? 0xed4245 : 0x5865f2;
      await message
        ?.edit({
          embeds: [
            brandEmbed()
              .setTitle(`💡 Suggestion — ${state.toLowerCase()}`)
              .setDescription(suggestion.content)
              .setColor(color)
              .setFooter({ text: `Suggested by <@${suggestion.userId}> • ${state}` }),
          ],
        })
        .catch(() => undefined);
      await interaction.editReply({ content: '', embeds: [successEmbed(`Suggestion marked as **${state.toLowerCase()}**.`)] });
      return;
    }

    // channel (staff)
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ embeds: [warnEmbed(ctx.t('common.noPermission'))], flags: MessageFlags.Ephemeral });
      return;
    }
    const target = interaction.options.getChannel('target', true);
    await prisma.suggestionConfig.upsert({
      where: { guildId: guild.id },
      create: { guildId: guild.id, enabled: true, channelId: target.id },
      update: { enabled: true, channelId: target.id },
    });
    await interaction.reply({ embeds: [successEmbed(`Suggestions will now be posted in <#${target.id}>.`)] , flags: MessageFlags.Ephemeral });
  },
};

export const starboardCommand: BotCommand = {
  data: guildCommand('starboard', 'Configure the starboard', PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Enable the starboard')
        .addChannelOption((option) => option.setName('channel').setDescription('Starboard channel').setRequired(true))
        .addIntegerOption((option) =>
          option.setName('threshold').setDescription('Stars required').setRequired(false).setMinValue(1).setMaxValue(100),
        )
        .addStringOption((option) => option.setName('emoji').setDescription('Star emoji (default ⭐)').setRequired(false).setMaxLength(64)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('options')
        .setDescription('Toggle starboard behaviors')
        .addBooleanOption((option) => option.setName('self_star').setDescription('Allow authors to star their own message').setRequired(false))
        .addBooleanOption((option) => option.setName('ignore_bots').setDescription('Ignore bot messages').setRequired(false)),
    )
    .addSubcommand((sub) => sub.setName('disable').setDescription('Disable the starboard'))
    .addSubcommand((sub) => sub.setName('info').setDescription('Show starboard configuration')),
  category: 'social',
  async execute(ctx) {
    const { interaction, guild } = ctx;
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel', true);
      const threshold = interaction.options.getInteger('threshold') ?? 5;
      const emoji = interaction.options.getString('emoji') ?? '⭐';
      await prisma.starboardConfig.upsert({
        where: { guildId: guild.id },
        create: { guildId: guild.id, enabled: true, channelId: channel.id, threshold, emoji },
        update: { enabled: true, channelId: channel.id, threshold, emoji },
      });
      await interaction.editReply({
        content: '',
        embeds: [successEmbed(`Starboard enabled in <#${channel.id}> — **${threshold}× ${emoji}** required.`)],
      });
      return;
    }

    if (sub === 'options') {
      const selfStar = interaction.options.getBoolean('self_star');
      const ignoreBots = interaction.options.getBoolean('ignore_bots');
      await prisma.starboardConfig.update({
        where: { guildId: guild.id },
        data: {
          ...(selfStar !== null ? { selfStar } : {}),
          ...(ignoreBots !== null ? { ignoreBots } : {}),
        },
      });
      await interaction.editReply({ content: '', embeds: [successEmbed('Starboard options updated.')] });
      return;
    }

    if (sub === 'disable') {
      await prisma.starboardConfig.update({ where: { guildId: guild.id }, data: { enabled: false } });
      await interaction.editReply({ content: '', embeds: [successEmbed('Starboard disabled.')] });
      return;
    }

    const config = await prisma.starboardConfig.findUnique({ where: { guildId: guild.id } });
    await interaction.editReply({
      content: '',
      embeds: [
        brandEmbed()
          .setTitle('Starboard configuration')
          .addFields(
            { name: 'Enabled', value: config?.enabled ? 'Yes' : 'No', inline: true },
            { name: 'Channel', value: config?.channelId ? `<#${config.channelId}>` : 'Not set', inline: true },
            { name: 'Threshold', value: String(config?.threshold ?? 5), inline: true },
            { name: 'Emoji', value: config?.emoji ?? '⭐', inline: true },
            { name: 'Self star', value: config?.selfStar ? 'Allowed' : 'Blocked', inline: true },
            { name: 'Ignore bots', value: config?.ignoreBots ? 'Yes' : 'No', inline: true },
          ),
      ],
    });
  },
};
