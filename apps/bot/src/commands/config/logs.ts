import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { prisma } from '@nexora/database';
import { brandEmbed, successEmbed, warnEmbed } from '@nexora/discord';
import { logCategoryNameSchema } from '@nexora/validation';
import { z } from 'zod';
import { guildCommand } from '../../framework/builders';
import type { BotCommand } from '../../framework/types';
import { invalidateLogConfigCache } from '../../services/logging';

export const autoroleCommand: BotCommand = {
  data: guildCommand('autorole', 'Manage roles given automatically on join', PermissionFlagsBits.ManageRoles)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add an autorole')
        .addRoleOption((option) => option.setName('role').setDescription('Role to give on join').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove an autorole')
        .addRoleOption((option) => option.setName('role').setDescription('Role to remove').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('List autoroles')),
  category: 'config',
  botPermissions: [PermissionFlagsBits.ManageRoles],
  async execute(ctx) {
    const { interaction, guild } = ctx;
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'add') {
      const role = interaction.options.getRole('role', true);
      const me = guild.members.me;
      if (!me?.permissions.has(PermissionFlagsBits.ManageRoles) || role.position >= me.roles.highest.position) {
        await interaction.editReply({ content: '', embeds: [warnEmbed(`I cannot assign **${role.name}** — it is above my highest role.`)] });
        return;
      }
      const config = await prisma.welcomeConfig.findUnique({ where: { guildId: guild.id } });
      const roles = config?.autoRoleIds ?? [];
      if (roles.length >= 10) {
        await interaction.editReply({ content: '', embeds: [warnEmbed('You can have at most 10 autoroles.')] });
        return;
      }
      await prisma.welcomeConfig.update({
        where: { guildId: guild.id },
        data: { autoRoleIds: [...roles, role.id] },
      });
      await interaction.editReply({ content: '', embeds: [successEmbed(`**${role.name}** will now be given on join.`)] });
      return;
    }

    if (sub === 'remove') {
      const role = interaction.options.getRole('role', true);
      const config = await prisma.welcomeConfig.findUnique({ where: { guildId: guild.id } });
      const roles = config?.autoRoleIds ?? [];
      if (!roles.includes(role.id)) {
        await interaction.editReply({ content: '', embeds: [warnEmbed('That role is not an autorole.')] });
        return;
      }
      await prisma.welcomeConfig.update({
        where: { guildId: guild.id },
        data: { autoRoleIds: roles.filter((id) => id !== role.id) },
      });
      await interaction.editReply({ content: '', embeds: [successEmbed(`**${role.name}** removed from autoroles.`)] });
      return;
    }

    // list
    const config = await prisma.welcomeConfig.findUnique({ where: { guildId: guild.id } });
    const roles = config?.autoRoleIds ?? [];
    await interaction.editReply({
      content: '',
      embeds: [
        brandEmbed()
          .setTitle('Autoroles')
          .setDescription(roles.length > 0 ? roles.map((id) => `<@&${id}>`).join(' ') : 'No autoroles configured.'),
      ],
    });
  },
};

const LOG_CATEGORY_CHOICES = z.enum(logCategoryNameSchema.options).options.map((value) => ({ name: value, value }));

export const logsCommand: BotCommand = {
  data: guildCommand('logs', 'Configure logging', PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName('enable').setDescription('Enable logging'))
    .addSubcommand((sub) => sub.setName('disable').setDescription('Disable all logging'))
    .addSubcommand((sub) =>
      sub
        .setName('category')
        .setDescription('Enable a category and set its channel')
        .addStringOption((option) =>
          option.setName('name').setDescription('Category name').setRequired(true).addChoices(...LOG_CATEGORY_CHOICES),
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel for this category')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('ignore')
        .setDescription('Ignore a channel in logs')
        .addChannelOption((option) => option.setName('channel').setDescription('Channel to ignore').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('unignore')
        .setDescription('Stop ignoring a channel')
        .addChannelOption((option) => option.setName('channel').setDescription('Channel to unignore').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Show the logging configuration')),
  category: 'config',
  async execute(ctx) {
    const { interaction, guild } = ctx;
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'enable' || sub === 'disable') {
      await prisma.logConfig.update({
        where: { guildId: guild.id },
        data: { enabled: sub === 'enable' },
      });
      invalidateLogConfigCache(guild.id);
      await interaction.editReply({
        content: '',
        embeds: [successEmbed(`Logging ${sub === 'enable' ? 'enabled' : 'disabled'}.`)],
      });
      return;
    }

    if (sub === 'category') {
      const name = interaction.options.getString('name', true);
      const channel = interaction.options.getChannel('channel', true);
      const config = await prisma.logConfig.findUnique({ where: { guildId: guild.id } });
      const parsed = z.record(logCategoryNameSchema, z.object({ enabled: z.boolean().default(false), channelId: z.string().optional() }))
        .safeParse(config?.categories ?? {});
      const categories = parsed.success ? parsed.data : {};
      await prisma.logConfig.update({
        where: { guildId: guild.id },
        data: {
          enabled: true,
          categories: JSON.parse(JSON.stringify({ ...categories, [name]: { enabled: true, channelId: channel.id } })),
        },
      });
      invalidateLogConfigCache(guild.id);
      await interaction.editReply({
        content: '',
        embeds: [successEmbed(`Category **${name}** now logs to <#${channel.id}>.`)],
      });
      return;
    }

    if (sub === 'ignore' || sub === 'unignore') {
      const channel = interaction.options.getChannel('channel', true);
      const config = await prisma.logConfig.findUnique({ where: { guildId: guild.id } });
      const ignored = config?.ignoredChannelIds ?? [];
      const next = sub === 'ignore' ? [...new Set([...ignored, channel.id])] : ignored.filter((id) => id !== channel.id);
      await prisma.logConfig.update({ where: { guildId: guild.id }, data: { ignoredChannelIds: next } });
      invalidateLogConfigCache(guild.id);
      await interaction.editReply({
        content: '',
        embeds: [successEmbed(`<#${channel.id}> ${sub === 'ignore' ? 'added to' : 'removed from'} the ignore list.`)],
      });
      return;
    }

    // list
    const config = await prisma.logConfig.findUnique({ where: { guildId: guild.id } });
    const parsed = z.record(logCategoryNameSchema, z.object({ enabled: z.boolean().default(false), channelId: z.string().optional() }))
      .safeParse(config?.categories ?? {});
    const categories = parsed.success ? parsed.data : {};
    const embed = brandEmbed()
      .setTitle('Logging configuration')
      .addFields({ name: 'Enabled', value: config?.enabled ? 'Yes' : 'No', inline: true });
    const lines = Object.entries(categories)
      .filter(([, value]) => value.enabled)
      .map(([name, value]) => `**${name}** → ${value.channelId ? `<#${value.channelId}>` : 'no channel'}`);
    embed.addFields({ name: 'Active categories', value: lines.join('\n') || 'None' });
    const ignored = config?.ignoredChannelIds ?? [];
    embed.addFields({ name: 'Ignored channels', value: ignored.map((id) => `<#${id}>`).join(' ') || 'None' });
    await interaction.editReply({ content: '', embeds: [embed] });
  },
};
