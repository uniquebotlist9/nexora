import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { prisma } from '@nexora/database';
import { brandEmbed, errorEmbed, formatDuration, successEmbed, warnEmbed } from '@nexora/discord';
import { guildCommand } from '../../framework/builders';
import type { BotCommand } from '../../framework/types';
import { formatDate, truncate } from '../../core/utils';
import { createAppeal, resolveAppeal } from '../../services/moderation';

export const caseCommand: BotCommand = {
  data: guildCommand('case', 'Manage moderation cases', PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setDescription('View a case by number')
        .addIntegerOption((option) => option.setName('number').setDescription('Case number').setRequired(true).setMinValue(1)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('resolve')
        .setDescription('Mark a case as resolved')
        .addIntegerOption((option) => option.setName('number').setDescription('Case number').setRequired(true).setMinValue(1)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('evidence')
        .setDescription('Attach evidence links to a case')
        .addIntegerOption((option) => option.setName('number').setDescription('Case number').setRequired(true).setMinValue(1))
        .addStringOption((option) => option.setName('url').setDescription('Evidence URL').setRequired(true)),
    ),
  category: 'moderation',
  async execute(ctx) {
    const { interaction, guild } = ctx;
    const sub = interaction.options.getSubcommand();
    const number = interaction.options.getInteger('number', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const modCase = await prisma.moderationCase.findUnique({
      where: { guildId_caseNumber: { guildId: guild.id, caseNumber: number } },
      include: { appeal: true, warnings: true },
    });
    if (!modCase) {
      await interaction.editReply({ content: '', embeds: [errorEmbed(ctx.t('mod.noCase', { number }))] });
      return;
    }

    if (sub === 'view') {
      const embed = brandEmbed()
        .setTitle(`Case #${modCase.caseNumber} — ${modCase.type}`)
        .addFields(
          { name: 'Target', value: `<@${modCase.targetUserId}>`, inline: true },
          { name: 'Moderator', value: modCase.moderatorId ? `<@${modCase.moderatorId}>` : 'Unknown', inline: true },
          { name: 'Status', value: modCase.active ? 'Active' : 'Resolved', inline: true },
          { name: 'Reason', value: truncate(modCase.reason, 1000) },
        );
      if (modCase.durationMinutes) {
        embed.addFields({ name: 'Duration', value: formatDuration(modCase.durationMinutes * 60_000), inline: true });
      }
      if (modCase.evidence.length > 0) {
        embed.addFields({ name: 'Evidence', value: modCase.evidence.slice(0, 5).join('\n').slice(0, 1000) });
      }
      if (modCase.appeal) {
        embed.addFields({ name: `Appeal (${modCase.appeal.status})`, value: truncate(modCase.appeal.content, 1000) });
      }
      embed.setFooter({ text: `Created ${formatDate(modCase.createdAt)} • DM sent: ${modCase.dmSent ? 'yes' : 'no'}` });
      await interaction.editReply({ content: '', embeds: [embed] });
      return;
    }

    if (sub === 'resolve') {
      if (!modCase.active) {
        await interaction.editReply({ content: '', embeds: [warnEmbed(`Case #${number} is already resolved.`)] });
        return;
      }
      await prisma.moderationCase.update({
        where: { id: modCase.id },
        data: { active: false, resolvedAt: new Date() },
      });
      await interaction.editReply({ content: '', embeds: [successEmbed(`Case #${number} marked as resolved.`)] });
      return;
    }

    // evidence
    const url = interaction.options.getString('url', true);
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('bad protocol');
    } catch {
      await interaction.editReply({ content: '', embeds: [errorEmbed('Please provide a valid http(s) URL.')] });
      return;
    }
    await prisma.moderationCase.update({
      where: { id: modCase.id },
      data: { evidence: [...modCase.evidence, url].slice(0, 5) },
    });
    await interaction.editReply({ content: '', embeds: [successEmbed(`Evidence attached to case #${number}.`)] });
  },
};

export const modhistoryCommand: BotCommand = {
  data: guildCommand('modhistory', 'Show a member’s moderation history', PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName('user').setDescription('Member to look up').setRequired(true)),
  category: 'moderation',
  async execute(ctx) {
    const target = ctx.interaction.options.getUser('user', true);
    await ctx.interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const [cases, warnings] = await Promise.all([
      prisma.moderationCase.findMany({
        where: { guildId: ctx.guild.id, targetUserId: target.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.warning.count({ where: { guildId: ctx.guild.id, userId: target.id, active: true } }),
    ]);

    const embed = brandEmbed()
      .setTitle(`Moderation history — ${target.tag}`)
      .addFields({ name: 'Active warnings', value: String(warnings), inline: true }, { name: 'Total cases', value: String(cases.length), inline: true });
    if (cases.length === 0) {
      embed.setDescription('This member has a clean record. ✨');
    } else {
      embed.setDescription(
        cases
          .map(
            (modCase) =>
              `\`#${modCase.caseNumber}\` **${modCase.type}** ${modCase.active ? '' : '(resolved)'} — ${truncate(modCase.reason, 80)} • <t:${Math.floor(modCase.createdAt.getTime() / 1000)}:R>`,
          )
          .join('\n')
          .slice(0, 4000),
      );
    }
    await ctx.interaction.editReply({ content: '', embeds: [embed] });
  },
};

export const appealCommand: BotCommand = {
  data: guildCommand('appeal', 'Appeal a moderation case')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Submit an appeal for one of your cases')
        .addIntegerOption((option) => option.setName('number').setDescription('Your case number').setRequired(true).setMinValue(1))
        .addStringOption((option) => option.setName('content').setDescription('Why should this case be lifted?').setRequired(true).setMaxLength(2000)),
    )
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Check the appeal status for one of your cases').addIntegerOption((option) =>
        option.setName('number').setDescription('Your case number').setRequired(true).setMinValue(1),
      ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('resolve')
        .setDescription('Approve or deny an appeal (staff)')
        .addIntegerOption((option) => option.setName('number').setDescription('Case number').setRequired(true).setMinValue(1))
        .addBooleanOption((option) => option.setName('approve').setDescription('Approve the appeal?').setRequired(true)),
    ),
  category: 'moderation',
  cooldownSeconds: 10,
  async execute(ctx) {
    const { interaction, guild } = ctx;
    const sub = interaction.options.getSubcommand();
    const number = interaction.options.getInteger('number', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'create') {
      const content = interaction.options.getString('content', true);
      const result = await createAppeal(guild.id, number, interaction.user.id, content);
      switch (result.result) {
        case 'created':
          await interaction.editReply({ content: '', embeds: [successEmbed(ctx.t('mod.appealSubmitted', { number }))] });
          break;
        case 'noCase':
          await interaction.editReply({ content: '', embeds: [errorEmbed(ctx.t('mod.noCase', { number }))] });
          break;
        case 'invalidCase':
          await interaction.editReply({ content: '', embeds: [errorEmbed('You can only appeal your own cases.')] });
          break;
        case 'duplicate':
          await interaction.editReply({ content: '', embeds: [warnEmbed('An appeal for that case already exists.')] });
          break;
        default:
          await interaction.editReply({ content: '', embeds: [errorEmbed('Could not create the appeal.')] });
      }
      return;
    }

    if (sub === 'status') {
      const modCase = await prisma.moderationCase.findUnique({
        where: { guildId_caseNumber: { guildId: guild.id, caseNumber: number } },
        include: { appeal: true },
      });
      if (!modCase || modCase.targetUserId !== interaction.user.id) {
        await interaction.editReply({ content: '', embeds: [errorEmbed(ctx.t('mod.noCase', { number }))] });
        return;
      }
      const appeal = modCase.appeal;
      await interaction.editReply({
        content: '',
        embeds: [
          appeal
            ? brandEmbed()
                .setTitle(`Appeal for case #${number}`)
                .addFields(
                  { name: 'Status', value: appeal.status, inline: true },
                  { name: 'Submitted', value: formatDate(appeal.createdAt), inline: true },
                )
            : warnEmbed('You have not appealed that case yet.'),
        ],
      });
      return;
    }

    // resolve (staff)
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
      await interaction.editReply({ content: '', embeds: [errorEmbed(ctx.t('common.noPermission'))] });
      return;
    }
    const approve = interaction.options.getBoolean('approve', true);
    const result = await resolveAppeal(guild, number, interaction.user.id, approve);
    switch (result.result) {
      case 'ok':
        await interaction.editReply({
          content: '',
          embeds: [successEmbed(ctx.t('mod.appealResolved', { number, status: approve ? 'APPROVED' : 'DENIED' }))],
        });
        break;
      case 'noCase':
        await interaction.editReply({ content: '', embeds: [errorEmbed(ctx.t('mod.noCase', { number }))] });
        break;
      default:
        await interaction.editReply({ content: '', embeds: [warnEmbed('That case has no pending appeal.')] });
    }
  },
};
