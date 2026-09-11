import { ChannelType, MessageFlags, PermissionFlagsBits, type TextBasedChannel } from 'discord.js';
import { errorEmbed, successEmbed, warnEmbed } from '@nexora/discord';
import { guildCommand } from '../../framework/builders';
import { registerConfirmHandler, requestConfirmation } from '../../framework/confirm';
import type { BotCommand } from '../../framework/types';
import { describeModError, lockChannel, purgeMessages, unlockChannel } from '../../services/moderation';
import { getContext } from '../../core/context';

export const lockCommand: BotCommand = {
  data: guildCommand('lock', 'Lock a channel so members cannot send messages', PermissionFlagsBits.ManageChannels)
    .addChannelOption((option) =>
      option.setName('channel').setDescription('Channel to lock (defaults to current)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addStringOption((option) => option.setName('reason').setDescription('Reason').setRequired(false).setMaxLength(500)),
  category: 'moderation',
  botPermissions: [PermissionFlagsBits.ManageChannels],
  async execute(ctx) {
    const channel = (ctx.interaction.options.getChannel('channel') ?? ctx.interaction.channel) as TextBasedChannel | null;
    if (!channel) return;
    const reason = ctx.interaction.options.getString('reason') ?? 'No reason provided';
    await ctx.interaction.deferReply();
    const outcome = await lockChannel(ctx.guild, channel, ctx.member.id, reason);
    if (!outcome.ok) {
      await ctx.interaction.editReply({ content: '', embeds: [errorEmbed(describeModError(outcome))] });
      return;
    }
    await ctx.interaction.editReply({ content: '', embeds: [successEmbed(`<#${channel.id}> is now locked. 🔒`)] });
  },
};

export const unlockCommand: BotCommand = {
  data: guildCommand('unlock', 'Unlock a previously locked channel', PermissionFlagsBits.ManageChannels)
    .addChannelOption((option) =>
      option.setName('channel').setDescription('Channel to unlock (defaults to current)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addStringOption((option) => option.setName('reason').setDescription('Reason').setRequired(false).setMaxLength(500)),
  category: 'moderation',
  botPermissions: [PermissionFlagsBits.ManageChannels],
  async execute(ctx) {
    const channel = (ctx.interaction.options.getChannel('channel') ?? ctx.interaction.channel) as TextBasedChannel | null;
    if (!channel) return;
    const reason = ctx.interaction.options.getString('reason') ?? 'No reason provided';
    await ctx.interaction.deferReply();
    const outcome = await unlockChannel(ctx.guild, channel, ctx.member.id, reason);
    if (!outcome.ok) {
      await ctx.interaction.editReply({ content: '', embeds: [errorEmbed(describeModError(outcome))] });
      return;
    }
    await ctx.interaction.editReply({ content: '', embeds: [successEmbed(`<#${channel.id}> is now unlocked. 🔓`)] });
  },
};

export const slowmodeCommand: BotCommand = {
  data: guildCommand('slowmode', 'Set channel slowmode', PermissionFlagsBits.ManageChannels)
    .addIntegerOption((option) =>
      option
        .setName('seconds')
        .setDescription('Slowmode in seconds (0 to disable, max 21600)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600),
    )
    .addChannelOption((option) =>
      option.setName('channel').setDescription('Channel (defaults to current)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addStringOption((option) => option.setName('reason').setDescription('Reason').setRequired(false).setMaxLength(500)),
  category: 'moderation',
  botPermissions: [PermissionFlagsBits.ManageChannels],
  async execute(ctx) {
    const seconds = ctx.interaction.options.getInteger('seconds', true);
    const resolved = ctx.interaction.options.getChannel('channel') ?? ctx.interaction.channel;
    const channel = resolved ? await ctx.guild.channels.fetch(resolved.id).catch(() => null) : null;
    if (!channel || channel.type !== ChannelType.GuildText) {
      await ctx.interaction.reply({ embeds: [warnEmbed('Slowmode can only be set on text channels.')], flags: MessageFlags.Ephemeral });
      return;
    }
    const reason = ctx.interaction.options.getString('reason') ?? 'No reason provided';
    const result = await channel.setRateLimitPerUser(seconds, reason).then(
      () => true,
      () => false,
    );
    if (!result) {
      await ctx.interaction.reply({ embeds: [errorEmbed('I could not set slowmode on that channel.')], flags: MessageFlags.Ephemeral });
      return;
    }
    await ctx.interaction.reply({
      embeds: [
        successEmbed(seconds === 0 ? `Slowmode disabled in <#${channel.id}>.` : `Slowmode in <#${channel.id}> set to **${seconds}s**.`),
      ],
    });
  },
};

registerConfirmHandler('mod:purge', async (interaction, data) => {
  const guild = interaction.guild;
  if (!guild) return;
  const channelId = String(data['channelId'] ?? '');
  const count = Number(data['count'] ?? 0);
  const filterUserId = data['filterUserId'] ? String(data['filterUserId']) : null;
  const channel = await getContext().client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    await interaction.reply({ embeds: [errorEmbed('That channel is no longer available.')], flags: MessageFlags.Ephemeral });
    return;
  }
  const outcome = await purgeMessages({
    guild,
    channel,
    count,
    moderatorId: interaction.user.id,
    filterUserId,
  });
  if (!outcome.ok) {
    await interaction.reply({ embeds: [errorEmbed(describeModError(outcome))], flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({
    embeds: [successEmbed(`Deleted **${outcome.detail ?? 0}** messages in <#${channelId}>.`)],
    flags: MessageFlags.Ephemeral,
  });
});

export const purgeCommand: BotCommand = {
  data: guildCommand('purge', 'Bulk delete messages in a channel', PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) =>
      option.setName('count').setDescription('Number of messages to delete (1-500)').setRequired(true).setMinValue(1).setMaxValue(500),
    )
    .addUserOption((option) => option.setName('user').setDescription('Only delete messages from this member').setRequired(false))
    .addChannelOption((option) =>
      option.setName('channel').setDescription('Channel (defaults to current)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    ),
  category: 'moderation',
  botPermissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory],
  async execute(ctx) {
    const count = ctx.interaction.options.getInteger('count', true);
    const user = ctx.interaction.options.getUser('user');
    const channel = ctx.interaction.options.getChannel('channel') ?? ctx.interaction.channel;
    if (!channel) return;
    await requestConfirmation(ctx.interaction, {
      kind: 'mod:purge',
      data: {
        channelId: channel.id,
        count,
        filterUserId: user?.id,
      },
      prompt: `Delete up to **${count}** messages in <#${channel.id}>${user ? ` from **${user.tag}**` : ''}?`,
    });
  },
};

export const nickCommand: BotCommand = {
  data: guildCommand('nick', 'Change a member’s nickname', PermissionFlagsBits.ManageNicknames)
    .addUserOption((option) => option.setName('user').setDescription('Member (defaults to you)').setRequired(false))
    .addStringOption((option) => option.setName('nickname').setDescription('New nickname (empty to reset)').setRequired(false).setMaxLength(32)),
  category: 'moderation',
  botPermissions: [PermissionFlagsBits.ManageNicknames],
  async execute(ctx) {
    const target = ctx.interaction.options.getUser('user') ?? ctx.interaction.user;
    const nickname = ctx.interaction.options.getString('nickname');
    const member = await ctx.guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      await ctx.interaction.reply({ embeds: [warnEmbed('That member is not in this server.')], flags: MessageFlags.Ephemeral });
      return;
    }
    const result = await member.setNickname(nickname ?? null, `Changed by ${ctx.interaction.user.tag}`).then(
      () => true,
      () => false,
    );
    if (!result) {
      await ctx.interaction.reply({
        embeds: [warnEmbed(ctx.t('common.botHierarchyError', { target: target.tag }))],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await ctx.interaction.reply({
      embeds: [successEmbed(`Nickname for **${target.tag}** ${nickname ? `set to **${nickname}**` : 'reset'}.`)],
    });
  },
};
