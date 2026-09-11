import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { prisma } from '@nexora/database';
import { brandEmbed, successEmbed, warnEmbed } from '@nexora/discord';
import { guildCommand } from '../../framework/builders';
import type { BotCommand } from '../../framework/types';
import { ensureScheduledAutomations } from '../../services/automations';
import { truncate } from '../../core/utils';

/**
 * Automations are built on the dashboard (their configuration is too rich for
 * slash options); the bot offers list / toggle / delete for on-the-go control.
 */
export const automationCommand: BotCommand = {
  data: guildCommand('automation', 'List or toggle automations', PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName('list').setDescription('List automations'))
    .addSubcommand((sub) =>
      sub
        .setName('toggle')
        .setDescription('Enable or disable an automation')
        .addStringOption((option) => option.setName('name').setDescription('Automation name').setRequired(true).setMaxLength(100)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete an automation')
        .addStringOption((option) => option.setName('name').setDescription('Automation name').setRequired(true).setMaxLength(100)),
    ),
  category: 'automations',
  cooldownSeconds: 5,
  async execute(ctx) {
    const { interaction, guild } = ctx;
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const automations = await prisma.automation.findMany({
        where: { guildId: guild.id },
        orderBy: { createdAt: 'desc' },
        take: 25,
      });
      await interaction.editReply({
        content: '',
        embeds: [
          brandEmbed()
            .setTitle(`Automations (${automations.length})`)
            .setDescription(
              automations.length === 0
                ? 'No automations yet — build them on the Nexora dashboard.'
                : automations
                    .map(
                      (automation) =>
                        `\`${truncate(automation.name, 40)}\` — ${automation.trigger} ${automation.enabled ? '✅' : '❌'} (${automation.triggerCount} runs)`,
                    )
                    .join('\n')
                    .slice(0, 4000),
            ),
        ],
      });
      return;
    }

    if (sub === 'toggle') {
      const name = interaction.options.getString('name', true).trim();
      const automation = await prisma.automation.findFirst({ where: { guildId: guild.id, name: { contains: name } } });
      if (!automation) {
        await interaction.reply({ embeds: [warnEmbed('No automation with that name.')], flags: MessageFlags.Ephemeral });
        return;
      }
      await prisma.automation.update({ where: { id: automation.id }, data: { enabled: !automation.enabled } });
      await ensureScheduledAutomations(guild.id).catch(() => undefined);
      await interaction.reply({
        embeds: [successEmbed(`Automation **${automation.name}** ${automation.enabled ? 'disabled' : 'enabled'}.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // delete
    const name = interaction.options.getString('name', true).trim();
    const deleted = await prisma.automation.deleteMany({ where: { guildId: guild.id, name: { contains: name } } });
    await interaction.reply({
      embeds: [deleted.count > 0 ? successEmbed('Automation deleted.') : warnEmbed('No automation with that name.')],
      flags: MessageFlags.Ephemeral,
    });
  },
};
