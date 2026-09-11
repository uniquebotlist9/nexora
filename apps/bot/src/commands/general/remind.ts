import { MessageFlags } from 'discord.js';
import { prisma } from '@nexora/database';
import { brandEmbed, successEmbed, warnEmbed } from '@nexora/discord';
import { guildCommand } from '../../framework/builders';
import type { BotCommand } from '../../framework/types';
import { parseDurationMinutes } from '../../core/utils';
import { scheduleTask } from '../../services/task-queue';

export const remindCommand: BotCommand = {
  data: guildCommand('remind', 'Set a personal reminder')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create a reminder')
        .addStringOption((option) =>
          option.setName('duration').setDescription('How long from now (e.g. 30m, 2h, 1d, 1h30m)').setRequired(true),
        )
        .addStringOption((option) => option.setName('content').setDescription('What to remind you about').setRequired(true).setMaxLength(1000)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('List your pending reminders'))
    .addSubcommand((sub) =>
      sub.setName('cancel').setDescription('Cancel a reminder').addIntegerOption((option) =>
        option.setName('id').setDescription('The reminder ID from /remind list').setRequired(true),
      ),
    ),
  category: 'general',
  cooldownSeconds: 5,
  async execute(ctx) {
    const { interaction, t } = ctx;
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const durationInput = interaction.options.getString('duration', true);
      const content = interaction.options.getString('content', true);
      const minutes = parseDurationMinutes(durationInput);
      if (minutes === null || minutes > 60 * 24 * 365) {
        await interaction.reply({ embeds: [warnEmbed(t('common.invalidDuration'))], flags: MessageFlags.Ephemeral });
        return;
      }
      await prisma.user.upsert({
        where: { id: interaction.user.id },
        create: { id: interaction.user.id },
        update: {},
      });
      const reminder = await prisma.reminder.create({
        data: {
          userId: interaction.user.id,
          guildId: ctx.guild.id,
          channelId: interaction.channelId,
          content,
          remindAt: new Date(Date.now() + minutes * 60_000),
        },
      });
      await scheduleTask({
        guildId: ctx.guild.id,
        kind: 'REMINDER',
        payload: { reminderId: reminder.id },
        runAt: reminder.remindAt,
      });
      await interaction.reply({
        embeds: [
          successEmbed(
            `I will remind you in **${durationInput}** (<t:${Math.floor(reminder.remindAt.getTime() / 1000)}:R>).`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'list') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const reminders = await prisma.reminder.findMany({
        where: { userId: interaction.user.id, delivered: false },
        orderBy: { remindAt: 'asc' },
        take: 10,
      });
      if (reminders.length === 0) {
        await interaction.editReply({ content: '', embeds: [brandEmbed().setDescription('You have no pending reminders.')] });
        return;
      }
      const embed = brandEmbed()
        .setTitle('⏰ Your reminders')
        .setDescription(
          reminders
            .map((reminder) => `**#${reminder.id.slice(-6)}** <t:${Math.floor(reminder.remindAt.getTime() / 1000)}:R> — ${reminder.content}`)
            .join('\n')
            .slice(0, 4000),
        );
      await interaction.editReply({ content: '', embeds: [embed] });
      return;
    }

    // cancel
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const id = interaction.options.getInteger('id', true);
    const reminders = await prisma.reminder.findMany({
      where: { userId: interaction.user.id, delivered: false },
    });
    const reminder = reminders.find((entry) => entry.id.endsWith(String(id)) || entry.id.slice(-6) === String(id));
    if (!reminder) {
      await interaction.editReply({ content: '', embeds: [warnEmbed('No pending reminder with that ID. Use /remind list.')] });
      return;
    }
    await prisma.reminder.delete({ where: { id: reminder.id } });
    await interaction.editReply({ content: '', embeds: [successEmbed('Reminder cancelled.')] });
  },
};
