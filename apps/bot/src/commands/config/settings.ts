import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { prisma } from '@nexora/database';
import { brandEmbed, successEmbed } from '@nexora/discord';
import { guildCommand } from '../../framework/builders';
import type { BotCommand } from '../../framework/types';
import { SUPPORTED_LANGUAGES } from '../../core/i18n';
import { getGuildPlan, invalidateGuildSettings } from '../../core/guilds';

export const settingsCommand: BotCommand = {
  data: guildCommand('settings', 'View or change Nexora settings for this server', PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName('view').setDescription('Show current settings'))
    .addSubcommand((sub) =>
      sub
        .setName('language')
        .setDescription('Set the bot language')
        .addStringOption((option) =>
          option
            .setName('code')
            .setDescription('Language code')
            .setRequired(true)
            .addChoices(...SUPPORTED_LANGUAGES.map((code) => ({ name: code, value: code }))),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('cooldown')
        .setDescription('Set the default command cooldown in seconds')
        .addIntegerOption((option) =>
          option.setName('seconds').setDescription('Cooldown (0-60s)').setRequired(true).setMinValue(0).setMaxValue(60),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('modlog')
        .setDescription('Set the moderation log channel')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('Channel for moderation logs').setRequired(true).addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('escalate')
        .setDescription('Toggle the warning escalation engine')
        .addBooleanOption((option) => option.setName('enabled').setDescription('Enable escalation?').setRequired(true)),
    ),
  category: 'config',
  async execute(ctx) {
    const { interaction, guild, settings } = ctx;
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'view') {
      const embed = brandEmbed()
        .setTitle(`Settings — ${guild.name}`)
        .addFields(
          { name: 'Language', value: settings.language, inline: true },
          { name: 'Timezone', value: settings.timezone, inline: true },
          { name: 'Command cooldown', value: `${settings.commandCooldownSeconds}s`, inline: true },
          { name: 'Escalation engine', value: settings.escalateOnWarn ? 'Enabled' : 'Disabled', inline: true },
          { name: 'Mod log channel', value: settings.modLogChannelId ? `<#${settings.modLogChannelId}>` : 'Not set', inline: true },
          { name: 'Case count', value: String(settings.modCaseCount), inline: true },
        );
      await interaction.editReply({ content: '', embeds: [embed] });
      return;
    }

    if (sub === 'language') {
      const code = interaction.options.getString('code', true);
      await prisma.guildSettings.update({ where: { guildId: guild.id }, data: { language: code } });
      invalidateGuildSettings(guild.id);
      await interaction.editReply({ content: '', embeds: [successEmbed(`Language set to **${code}**.`)] });
      return;
    }

    if (sub === 'cooldown') {
      const seconds = interaction.options.getInteger('seconds', true);
      await prisma.guildSettings.update({ where: { guildId: guild.id }, data: { commandCooldownSeconds: seconds } });
      invalidateGuildSettings(guild.id);
      await interaction.editReply({ content: '', embeds: [successEmbed(`Default command cooldown set to **${seconds}s**.`)] });
      return;
    }

    if (sub === 'modlog') {
      const channel = interaction.options.getChannel('channel', true);
      await prisma.guildSettings.update({ where: { guildId: guild.id }, data: { modLogChannelId: channel.id } });
      invalidateGuildSettings(guild.id);
      await interaction.editReply({ content: '', embeds: [successEmbed(`Moderation log channel set to <#${channel.id}>.`)] });
      return;
    }

    // escalate
    const enabled = interaction.options.getBoolean('enabled', true);
    await prisma.guildSettings.update({ where: { guildId: guild.id }, data: { escalateOnWarn: enabled } });
    invalidateGuildSettings(guild.id);
    await interaction.editReply({
      content: '',
      embeds: [successEmbed(`Warning escalation engine ${enabled ? 'enabled' : 'disabled'}.`)],
    });
  },
};

export const configCommand: BotCommand = {
  data: guildCommand('config', 'Show an overview of every Nexora feature on this server', PermissionFlagsBits.ManageGuild),
  category: 'config',
  async execute(ctx) {
    const { interaction, guild } = ctx;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const [welcome, tickets, level, economy, verification, antiRaid, starboard, suggestion, plan] = await Promise.all([
      prisma.welcomeConfig.findUnique({ where: { guildId: guild.id } }),
      prisma.ticketConfig.findUnique({ where: { guildId: guild.id } }),
      prisma.levelConfig.findUnique({ where: { guildId: guild.id } }),
      prisma.economyConfig.findUnique({ where: { guildId: guild.id } }),
      prisma.verificationConfig.findUnique({ where: { guildId: guild.id } }),
      prisma.antiRaidConfig.findUnique({ where: { guildId: guild.id } }),
      prisma.starboardConfig.findUnique({ where: { guildId: guild.id } }),
      prisma.suggestionConfig.findUnique({ where: { guildId: guild.id } }),
      getGuildPlan(guild.id),
    ]);
    const [autoModCount, automationCount, customCommandCount, backupCount] = await Promise.all([
      prisma.autoModRule.count({ where: { guildId: guild.id } }),
      prisma.automation.count({ where: { guildId: guild.id } }),
      prisma.customCommand.count({ where: { guildId: guild.id } }),
      prisma.backup.count({ where: { guildId: guild.id } }),
    ]);

    const enabled = (value: boolean | undefined | null): string => (value ? '✅' : '❌');
    const embed = brandEmbed()
      .setTitle(`Nexora configuration — ${guild.name}`)
      .addFields(
        { name: 'Plan', value: plan, inline: true },
        { name: 'Automod rules', value: String(autoModCount), inline: true },
        { name: 'Automations', value: String(automationCount), inline: true },
        {
          name: 'Welcome / farewell',
          value: `${enabled(welcome?.welcomeEnabled)} / ${enabled(welcome?.farewellEnabled)}`,
          inline: true,
        },
        { name: 'Autoroles', value: String(welcome?.autoRoleIds.length ?? 0), inline: true },
        { name: 'Tickets', value: enabled(tickets?.enabled), inline: true },
        { name: 'Leveling', value: enabled(level?.enabled), inline: true },
        { name: 'Economy', value: enabled(economy?.enabled), inline: true },
        { name: 'Verification', value: enabled(verification?.enabled), inline: true },
        { name: 'Anti-raid', value: enabled(antiRaid?.enabled), inline: true },
        { name: 'Starboard', value: enabled(starboard?.enabled), inline: true },
        { name: 'Suggestions', value: enabled(suggestion?.enabled), inline: true },
        { name: 'Custom commands', value: String(customCommandCount), inline: true },
        { name: 'Backups', value: String(backupCount), inline: true },
      )
      .setFooter({ text: 'Most features can be fully configured on the Nexora dashboard.' });
    await interaction.editReply({ content: '', embeds: [embed] });
  },
};
