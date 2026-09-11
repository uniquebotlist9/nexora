import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { prisma } from '@nexora/database';
import { AUTO_MOD_RULE_TYPES, type AutoModRuleType } from '@nexora/types';
import { brandEmbed, successEmbed, warnEmbed } from '@nexora/discord';
import { guildCommand } from '../../framework/builders';
import type { BotCommand } from '../../framework/types';
import { invalidateAutoModRules } from '../../services/automod';
import { getGuildLimits } from '../../core/guilds';
import { toJson } from '../../core/utils';

const RULE_TYPES: { name: string; value: string }[] = AUTO_MOD_RULE_TYPES.map((value) => ({
  name: value,
  value,
}));

interface ParsedAction {
  type: 'DELETE' | 'WARN' | 'TIMEOUT' | 'KICK' | 'BAN' | 'ADD_ROLE' | 'REMOVE_ROLE' | 'ALERT_MODS';
  durationMinutes?: number;
  roleId?: string;
  points?: number;
}

function parseActions(input: string): ParsedAction[] | string {
  const actions: ParsedAction[] = [];
  for (const raw of input.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean)) {
    if (raw === 'delete') actions.push({ type: 'DELETE' });
    else if (raw === 'warn') actions.push({ type: 'WARN' });
    else if (raw === 'timeout') actions.push({ type: 'TIMEOUT', durationMinutes: 10 });
    else if (raw === 'kick') actions.push({ type: 'KICK' });
    else if (raw === 'ban') actions.push({ type: 'BAN' });
    else if (raw === 'alert' || raw === 'alert_mods') actions.push({ type: 'ALERT_MODS' });
    else return `Unknown action "${raw}". Use: delete, warn, timeout, kick, ban, alert`;
  }
  if (actions.length === 0) return 'Provide at least one action.';
  if (actions.length > 5) return 'At most 5 actions per rule.';
  return actions;
}

export const automodCommand: BotCommand = {
  data: guildCommand('automod', 'Manage AutoMod rules', PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create an AutoMod rule')
        .addStringOption((option) => option.setName('name').setDescription('Rule name').setRequired(true).setMaxLength(100))
        .addStringOption((option) =>
          option.setName('type').setDescription('Rule type').setRequired(true).addChoices(...RULE_TYPES),
        )
        .addStringOption((option) =>
          option.setName('actions').setDescription('Comma-separated: delete, warn, timeout, kick, ban, alert').setRequired(true),
        )
        .addIntegerOption((option) =>
          option.setName('threshold').setDescription('Trigger threshold (messages/mentions/emojis, …)').setRequired(false).setMinValue(1).setMaxValue(1000),
        )
        .addIntegerOption((option) =>
          option.setName('window_seconds').setDescription('Window in seconds for rate rules').setRequired(false).setMinValue(1).setMaxValue(3600),
        )
        .addStringOption((option) =>
          option.setName('words').setDescription('Comma-separated blocked words (BAD_WORDS / NSFW rules)').setRequired(false),
        )
        .addIntegerOption((option) =>
          option.setName('caps_percent').setDescription('Caps percentage (EXCESSIVE_CAPS)').setRequired(false).setMinValue(1).setMaxValue(100),
        )
        .addIntegerOption((option) =>
          option.setName('duration_minutes').setDescription('Timeout duration for the timeout action').setRequired(false).setMinValue(1).setMaxValue(40320),
        ),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('List AutoMod rules'))
    .addSubcommand((sub) =>
      sub
        .setName('toggle')
        .setDescription('Enable or disable a rule')
        .addStringOption((option) => option.setName('name').setDescription('Rule name').setRequired(true).setMaxLength(100)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete a rule')
        .addStringOption((option) => option.setName('name').setDescription('Rule name').setRequired(true).setMaxLength(100)),
    ),
  category: 'automod',
  botPermissions: [PermissionFlagsBits.ManageMessages],
  cooldownSeconds: 5,
  async execute(ctx) {
    const { interaction, guild } = ctx;
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const name = interaction.options.getString('name', true).trim();
      const type = interaction.options.getString('type', true) as AutoModRuleType;
      const actionsRaw = interaction.options.getString('actions', true);
      const actions = parseActions(actionsRaw);
      if (typeof actions === 'string') {
        await interaction.reply({ embeds: [warnEmbed(actions)], flags: MessageFlags.Ephemeral });
        return;
      }
      const timeoutDuration = interaction.options.getInteger('duration_minutes');
      for (const action of actions) {
        if (action.type === 'TIMEOUT' && timeoutDuration) action.durationMinutes = timeoutDuration;
      }

      const limits = await getGuildLimits(guild.id);
      const count = await prisma.autoModRule.count({ where: { guildId: guild.id } });
      if (count >= limits.autoModRules) {
        await interaction.reply({
          embeds: [warnEmbed(`This server reached its plan limit of ${limits.autoModRules} AutoMod rules.`)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const existing = await prisma.autoModRule.findUnique({ where: { guildId_name: { guildId: guild.id, name } } });
      if (existing) {
        await interaction.reply({ embeds: [warnEmbed('A rule with that name already exists.')], flags: MessageFlags.Ephemeral });
        return;
      }

      const words = interaction.options.getString('words')?.split(',').map((word) => word.trim()).filter(Boolean).slice(0, 500);
      const trigger = toJson({
        threshold: interaction.options.getInteger('threshold') ?? undefined,
        windowSeconds: interaction.options.getInteger('window_seconds') ?? undefined,
        capsPercent: interaction.options.getInteger('caps_percent') ?? undefined,
        ...(words && words.length > 0 ? { words } : {}),
      });
      await prisma.autoModRule.create({
        data: {
          guildId: guild.id,
          name,
          type,
          trigger,
          actions: JSON.parse(JSON.stringify(actions)),
        },
      });
      invalidateAutoModRules(guild.id);
      await interaction.reply({
        embeds: [successEmbed(`AutoMod rule **${name}** (${type}) created with actions: ${actions.map((a) => a.type.toLowerCase()).join(', ')}.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'list') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const rules = await prisma.autoModRule.findMany({
        where: { guildId: guild.id },
        orderBy: { createdAt: 'asc' },
        take: 25,
      });
      await interaction.editReply({
        content: '',
        embeds: [
          brandEmbed()
            .setTitle('AutoMod rules')
            .setDescription(
              rules.length === 0
                ? 'No rules configured. Create one with /automod create.'
                : rules
                    .map((rule) => `\`${rule.name}\` — ${rule.type} ${rule.enabled ? '✅' : '❌'} (${rule.strikeCount} strikes)`)
                    .join('\n'),
            ),
        ],
      });
      return;
    }

    if (sub === 'toggle') {
      const name = interaction.options.getString('name', true).trim();
      const rule = await prisma.autoModRule.findUnique({ where: { guildId_name: { guildId: guild.id, name } } });
      if (!rule) {
        await interaction.reply({ embeds: [warnEmbed('No rule with that name.')], flags: MessageFlags.Ephemeral });
        return;
      }
      await prisma.autoModRule.update({ where: { id: rule.id }, data: { enabled: !rule.enabled } });
      invalidateAutoModRules(guild.id);
      await interaction.reply({
        embeds: [successEmbed(`Rule **${name}** ${rule.enabled ? 'disabled' : 'enabled'}.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // delete
    const name = interaction.options.getString('name', true).trim();
    const deleted = await prisma.autoModRule.deleteMany({ where: { guildId: guild.id, name } });
    invalidateAutoModRules(guild.id);
    await interaction.reply({
      embeds: [deleted.count > 0 ? successEmbed('Rule deleted.') : warnEmbed('No rule with that name.')],
      flags: MessageFlags.Ephemeral,
    });
  },
};
