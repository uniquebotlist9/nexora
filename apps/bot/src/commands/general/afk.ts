import { MessageFlags } from 'discord.js';
import { prisma } from '@nexora/database';
import { brandEmbed, successEmbed } from '@nexora/discord';
import { guildCommand } from '../../framework/builders';
import type { BotCommand } from '../../framework/types';

export const afkCommand: BotCommand = {
  data: guildCommand('afk', 'Set or clear your AFK status').addStringOption((option) =>
    option.setName('reason').setDescription('Why you are AFK (leave empty to clear)').setRequired(false).setMaxLength(500),
  ),
  category: 'general',
  cooldownSeconds: 5,
  async execute(ctx) {
    const { interaction } = ctx;
    const reason = interaction.options.getString('reason');

    if (!reason) {
      const removed = await prisma.aFKStatus.deleteMany({
        where: { guildId: ctx.guild.id, userId: interaction.user.id },
      });
      await interaction.reply({
        embeds: [
          removed.count > 0
            ? successEmbed('Your AFK status was cleared.')
            : brandEmbed().setDescription('You are not AFK.'),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await prisma.aFKStatus.upsert({
      where: { guildId_userId: { guildId: ctx.guild.id, userId: interaction.user.id } },
      create: { guildId: ctx.guild.id, userId: interaction.user.id, reason },
      update: { reason, since: new Date() },
    });
    await interaction.reply({
      embeds: [
        successEmbed(
          `You are now AFK: **${reason}**\nYour status clears automatically when you send your next message.`,
        ),
      ],
    });
  },
};
