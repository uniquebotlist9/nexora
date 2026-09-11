import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { brandEmbed, successEmbed, warnEmbed } from '@nexora/discord';
import { guildCommand } from '../../framework/builders';
import { registerConfirmHandler, requestConfirmation } from '../../framework/confirm';
import type { BotCommand } from '../../framework/types';
import { createBackup, deleteBackup, getBackup, listBackups, restoreBackup } from '../../services/backups';
import { formatDate } from '../../core/utils';

registerConfirmHandler('backup:restore', async (interaction, data) => {
  const guild = interaction.guild;
  if (!guild) return;
  const backupId = String(data['backupId'] ?? '');
  const result = await restoreBackup(guild, backupId);
  await interaction.reply({
    embeds: [
      result.ok
        ? successEmbed(`Backup **${result.backup.name}** restored — missing roles and channels were recreated.`)
        : warnEmbed(result.message),
    ],
    flags: MessageFlags.Ephemeral,
  });
});

export const backupCommand: BotCommand = {
  data: guildCommand('backup', 'Manage server backups', PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create a backup snapshot of roles, channels and settings')
        .addStringOption((option) => option.setName('name').setDescription('Backup name').setRequired(false).setMaxLength(100)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('List backups'))
    .addSubcommand((sub) =>
      sub
        .setName('restore')
        .setDescription('Restore a backup (creates missing roles/channels, never deletes)')
        .addStringOption((option) => option.setName('id').setDescription('Backup ID (see /backup list)').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete a backup')
        .addStringOption((option) => option.setName('id').setDescription('Backup ID').setRequired(true)),
    ),
  category: 'backup',
  cooldownSeconds: 15,
  botPermissions: [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels],
  async execute(ctx) {
    const { interaction, guild } = ctx;
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const name = interaction.options.getString('name') ?? `Backup ${new Date().toISOString().slice(0, 10)}`;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await createBackup(guild, interaction.user.id, name);
      if (!result.ok) {
        await interaction.editReply({ content: '', embeds: [warnEmbed(result.message)] });
        return;
      }
      await interaction.editReply({
        content: '',
        embeds: [
          successEmbed(
            `Backup **${result.backup.name}** created (${Math.round(result.backup.sizeBytes / 1024)} KB, id \`${result.backup.id}\`).`,
          ),
        ],
      });
      return;
    }

    if (sub === 'list') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const backups = await listBackups(guild.id);
      await interaction.editReply({
        content: '',
        embeds: [
          brandEmbed()
            .setTitle(`Backups (${backups.length})`)
            .setDescription(
              backups.length === 0
                ? 'No backups yet. Use /backup create.'
                : backups
                    .map((backup) => `\`${backup.id}\` — **${backup.name}** (${formatDate(backup.createdAt)}${backup.scheduled ? ', scheduled' : ''})`)
                    .join('\n')
                    .slice(0, 4000),
            ),
        ],
      });
      return;
    }

    if (sub === 'restore') {
      const backupId = interaction.options.getString('id', true).trim();
      const backup = await getBackup(guild.id, backupId);
      if (!backup) {
        await interaction.reply({ embeds: [warnEmbed('No backup with that ID.')], flags: MessageFlags.Ephemeral });
        return;
      }
      await requestConfirmation(interaction, {
        kind: 'backup:restore',
        data: { backupId: backup.id },
        prompt: `Restore backup **${backup.name}** from ${formatDate(backup.createdAt)}?\nThis creates missing roles and channels but never deletes anything.`,
      });
      return;
    }

    // delete
    const backupId = interaction.options.getString('id', true).trim();
    const deleted = await deleteBackup(guild.id, backupId);
    await interaction.reply({
      embeds: [deleted ? successEmbed('Backup deleted.') : warnEmbed('No backup with that ID.')],
      flags: MessageFlags.Ephemeral,
    });
  },
};
