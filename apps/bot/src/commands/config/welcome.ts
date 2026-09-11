import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { prisma } from '@nexora/database';
import { brandEmbed, successEmbed, warnEmbed } from '@nexora/discord';
import { guildCommand } from '../../framework/builders';
import type { BotCommand } from '../../framework/types';
import { toJson } from '../../core/utils';

interface MessagePayloadShape {
  content?: string;
  embed?: { title?: string; description?: string; color?: number };
}

export const welcomeCommand: BotCommand = {
  data: guildCommand('welcome', 'Configure welcome messages', PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName('view').setDescription('Show the current welcome configuration'))
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Set the welcome message')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('Welcome channel').setRequired(true).addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) => option.setName('description').setDescription('Embed description').setRequired(true).setMaxLength(4000))
        .addStringOption((option) => option.setName('title').setDescription('Embed title').setRequired(false).setMaxLength(256)),
    )
    .addSubcommand((sub) => sub.setName('disable').setDescription('Disable welcome messages'))
    .addSubcommand((sub) =>
      sub
        .setName('dm')
        .setDescription('Toggle the welcome DM')
        .addBooleanOption((option) => option.setName('enabled').setDescription('Send a DM to new members?').setRequired(true))
        .addStringOption((option) => option.setName('message').setDescription('DM message (supports {user}, {server}, …)').setRequired(false).setMaxLength(1000)),
    )
    .addSubcommand((sub) => sub.setName('test').setDescription('Send a test welcome message')),
  category: 'config',
  async execute(ctx) {
    const { interaction, guild } = ctx;
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'view') {
      const config = await prisma.welcomeConfig.findUnique({ where: { guildId: guild.id } });
      const payload = (config?.welcomeMessage ?? null) as MessagePayloadShape | null;
      await interaction.editReply({
        content: '',
        embeds: [
          brandEmbed()
            .setTitle('Welcome configuration')
            .addFields(
              { name: 'Enabled', value: config?.welcomeEnabled ? 'Yes' : 'No', inline: true },
              { name: 'Channel', value: config?.welcomeChannelId ? `<#${config.welcomeChannelId}>` : 'Not set', inline: true },
              { name: 'DM enabled', value: config?.welcomeDmEnabled ? 'Yes' : 'No', inline: true },
              { name: 'Message', value: payload?.embed?.description?.slice(0, 1000) ?? 'Default', inline: false },
            ),
        ],
      });
      return;
    }

    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel', true);
      const title = interaction.options.getString('title');
      const description = interaction.options.getString('description', true);
      await prisma.welcomeConfig.update({
        where: { guildId: guild.id },
        data: {
          welcomeEnabled: true,
          welcomeChannelId: channel.id,
          welcomeMessage: toJson({ embed: { title: title ?? 'Welcome!', description, color: 0x57f287 } }),
        },
      });
      await interaction.editReply({ content: '', embeds: [successEmbed(`Welcome message set for <#${channel.id}>.`)] });
      return;
    }

    if (sub === 'disable') {
      await prisma.welcomeConfig.update({ where: { guildId: guild.id }, data: { welcomeEnabled: false } });
      await interaction.editReply({ content: '', embeds: [successEmbed('Welcome messages disabled.')] });
      return;
    }

    if (sub === 'dm') {
      const enabled = interaction.options.getBoolean('enabled', true);
      const message = interaction.options.getString('message');
      await prisma.welcomeConfig.update({
        where: { guildId: guild.id },
        data: {
          welcomeDmEnabled: enabled,
          ...(message ? { welcomeDmMessage: toJson({ content: message }) } : {}),
        },
      });
      await interaction.editReply({ content: '', embeds: [successEmbed(`Welcome DM ${enabled ? 'enabled' : 'disabled'}.`)] });
      return;
    }

    // test
    const config = await prisma.welcomeConfig.findUnique({ where: { guildId: guild.id } });
    if (!config?.welcomeEnabled || !config.welcomeChannelId) {
      await interaction.editReply({ content: '', embeds: [warnEmbed('Welcome messages are not enabled yet. Use /welcome set first.')] });
      return;
    }
    const channel = await ctx.interaction.guild?.channels.fetch(config.welcomeChannelId).catch(() => null);
    if (!channel?.isSendable()) {
      await interaction.editReply({ content: '', embeds: [warnEmbed('I cannot send messages in the configured channel.')] });
      return;
    }
    const payload = (config.welcomeMessage ?? null) as MessagePayloadShape | null;
    await channel
      .send({
        embeds: [
          brandEmbed()
            .setTitle(payload?.embed?.title ?? 'Welcome!')
            .setDescription(
              (payload?.embed?.description ?? 'Welcome {user} to {server}!')
                .split('{user}')
                .join(`<@${interaction.user.id}>`)
                .split('{server}')
                .join(guild.name)
                .split('{membercount}')
                .join(String(guild.memberCount)),
            )
            .setColor(payload?.embed?.color ?? 0x57f287),
        ],
      })
      .catch(() => null);
    await interaction.editReply({ content: '', embeds: [successEmbed(`Test welcome sent to <#${config.welcomeChannelId}>.`)] });
  },
};

export const farewellCommand: BotCommand = {
  data: guildCommand('farewell', 'Configure farewell messages', PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName('view').setDescription('Show the current farewell configuration'))
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Set the farewell message')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('Farewell channel').setRequired(true).addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) => option.setName('description').setDescription('Message text').setRequired(true).setMaxLength(4000)),
    )
    .addSubcommand((sub) => sub.setName('disable').setDescription('Disable farewell messages')),
  category: 'config',
  async execute(ctx) {
    const { interaction, guild } = ctx;
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'view') {
      const config = await prisma.welcomeConfig.findUnique({ where: { guildId: guild.id } });
      const payload = (config?.farewellMessage ?? null) as MessagePayloadShape | null;
      await interaction.editReply({
        content: '',
        embeds: [
          brandEmbed()
            .setTitle('Farewell configuration')
            .addFields(
              { name: 'Enabled', value: config?.farewellEnabled ? 'Yes' : 'No', inline: true },
              { name: 'Channel', value: config?.farewellChannelId ? `<#${config.farewellChannelId}>` : 'Not set', inline: true },
              { name: 'Message', value: payload?.embed?.description?.slice(0, 1000) ?? 'Default', inline: false },
            ),
        ],
      });
      return;
    }

    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel', true);
      const description = interaction.options.getString('description', true);
      await prisma.welcomeConfig.update({
        where: { guildId: guild.id },
        data: {
          farewellEnabled: true,
          farewellChannelId: channel.id,
          farewellMessage: toJson({ embed: { title: 'Goodbye!', description, color: 0xed4245 } }),
        },
      });
      await interaction.editReply({ content: '', embeds: [successEmbed(`Farewell message set for <#${channel.id}>.`)] });
      return;
    }

    await prisma.welcomeConfig.update({ where: { guildId: guild.id }, data: { farewellEnabled: false } });
    await interaction.editReply({ content: '', embeds: [successEmbed('Farewell messages disabled.')] });
  },
};
