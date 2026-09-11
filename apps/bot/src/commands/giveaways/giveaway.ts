import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { brandEmbed, successEmbed, warnEmbed } from '@nexora/discord';
import { guildCommand } from '../../framework/builders';
import type { BotCommand } from '../../framework/types';
import { createGiveaway, endGiveawayEarly, listRunningGiveaways, rerollGiveaway } from '../../services/giveaways';
import { parseDurationMinutes, parseRoleMentions } from '../../core/utils';

/** Parse bonus roles like "<@&123> : 2" (extra entries) per line. */
function parseBonusRoles(input: string): { roleId: string; extraEntries: number }[] {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [rolePart, extraPart] = line.split(':').map((part) => part.trim());
      const roleId = parseRoleMentions(rolePart ?? '')[0];
      if (!roleId) return null;
      const extraEntries = Number.parseInt(extraPart ?? '1', 10);
      return { roleId, extraEntries: Number.isFinite(extraEntries) && extraEntries >= 1 ? Math.min(extraEntries, 100) : 1 };
    })
    .filter((entry): entry is { roleId: string; extraEntries: number } => entry !== null)
    .slice(0, 10);
}

export const giveawayCommand: BotCommand = {
  data: guildCommand('giveaway', 'Manage giveaways', PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Start a giveaway')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('Channel for the giveaway').setRequired(true).addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) => option.setName('prize').setDescription('Prize').setRequired(true).setMaxLength(256))
        .addIntegerOption((option) =>
          option.setName('winners').setDescription('Number of winners').setRequired(true).setMinValue(1).setMaxValue(50),
        )
        .addStringOption((option) => option.setName('duration').setDescription('Duration (e.g. 1h, 2d, 30m)').setRequired(true))
        .addStringOption((option) => option.setName('description').setDescription('Description').setRequired(false).setMaxLength(1000))
        .addRoleOption((option) => option.setName('required_role').setDescription('Role required to enter').setRequired(false))
        .addIntegerOption((option) =>
          option.setName('min_account_age_days').setDescription('Minimum account age in days').setRequired(false).setMinValue(0).setMaxValue(3650),
        )
        .addIntegerOption((option) =>
          option.setName('min_messages').setDescription('Minimum message count to enter').setRequired(false).setMinValue(0),
        )
        .addStringOption((option) =>
          option.setName('bonus_roles').setDescription('Bonus entries, one per line: @role : extraEntries').setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('end')
        .setDescription('End a running giveaway early')
        .addStringOption((option) => option.setName('message_id').setDescription('Giveaway message ID').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('reroll')
        .setDescription('Reroll winners for an ended giveaway')
        .addStringOption((option) => option.setName('message_id').setDescription('Giveaway message ID').setRequired(true))
        .addIntegerOption((option) => option.setName('count').setDescription('Number of new winners').setRequired(false).setMinValue(1).setMaxValue(20)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('List running giveaways')),
  category: 'giveaways',
  cooldownSeconds: 5,
  async execute(ctx) {
    const { interaction, guild } = ctx;
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const channel = interaction.options.getChannel('channel', true);
      const prize = interaction.options.getString('prize', true);
      const winners = interaction.options.getInteger('winners', true);
      const durationInput = interaction.options.getString('duration', true);
      const durationMinutes = parseDurationMinutes(durationInput);
      if (durationMinutes === null || durationMinutes > 60 * 24 * 30) {
        await interaction.reply({ embeds: [warnEmbed(ctx.t('common.invalidDuration'))], flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const bonusRolesInput = interaction.options.getString('bonus_roles');
      const result = await createGiveaway({
        guild,
        channelId: channel.id,
        prize,
        description: interaction.options.getString('description') ?? undefined,
        winnerCount: winners,
        durationMinutes,
        requiredRoleId: interaction.options.getRole('required_role')?.id,
        minAccountAgeDays: interaction.options.getInteger('min_account_age_days') ?? undefined,
        minMessages: interaction.options.getInteger('min_messages') ?? undefined,
        bonusRoles: bonusRolesInput ? parseBonusRoles(bonusRolesInput) : undefined,
        createdByUserId: interaction.user.id,
      });
      await interaction.editReply({
        content: '',
        embeds: [result.ok ? successEmbed(`Giveaway for **${prize}** started in <#${channel.id}>!`) : warnEmbed(result.message)],
      });
      return;
    }

    if (sub === 'end') {
      const messageId = interaction.options.getString('message_id', true);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await endGiveawayEarly(messageId);
      await interaction.editReply({
        content: '',
        embeds: [result.ok ? successEmbed('Giveaway ended — winners announced.') : warnEmbed(result.message)],
      });
      return;
    }

    if (sub === 'reroll') {
      const messageId = interaction.options.getString('message_id', true);
      const count = interaction.options.getInteger('count') ?? 1;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await rerollGiveaway(messageId, count);
      await interaction.editReply({
        content: '',
        embeds: [result.ok ? successEmbed('Reroll complete — new winners announced.') : warnEmbed(result.message)],
      });
      return;
    }

    // list
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const giveaways = await listRunningGiveaways(guild.id);
    await interaction.editReply({
      content: '',
      embeds: [
        brandEmbed()
          .setTitle('Running giveaways')
          .setDescription(
            giveaways.length === 0
              ? 'No running giveaways.'
              : giveaways
                  .map(
                    (giveaway) =>
                      `**${giveaway.prize}** — ${giveaway.winnerCount} winner(s) • ends <t:${Math.floor(giveaway.endsAt.getTime() / 1000)}:R> • message \`${giveaway.messageId}\``,
                  )
                  .join('\n')
                  .slice(0, 4000),
          ),
      ],
    });
  },
};
