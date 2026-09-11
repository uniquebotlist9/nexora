import { GuildMember, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, formatDuration, successEmbed, warnEmbed } from '@nexora/discord';
import { guildCommand } from '../../framework/builders';
import { registerConfirmHandler, requestConfirmation } from '../../framework/confirm';
import type { BotCommand, CommandContext } from '../../framework/types';
import {
  banMember,
  describeModError,
  kickMember,
  removeTimeout,
  softbanMember,
  tempbanMember,
  timeoutMember,
  warnMember,
} from '../../services/moderation';
import { parseDurationMinutes, truncate } from '../../core/utils';

async function resolveTarget(ctx: CommandContext): Promise<{ id: string; tag: string } | null> {
  const user = ctx.interaction.options.getUser('user');
  if (!user) return null;
  return { id: user.id, tag: user.tag };
}

function caseFooter(caseNumber: number | undefined): string {
  return caseNumber !== undefined ? `Case #${caseNumber}` : '';
}

export const warnCommand: BotCommand = {
  data: guildCommand('warn', 'Warn a member', PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName('user').setDescription('Member to warn').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the warning').setRequired(true).setMaxLength(1000)),
  category: 'moderation',
  botPermissions: [PermissionFlagsBits.ModerateMembers],
  async execute(ctx) {
    const target = await resolveTarget(ctx);
    const reason = ctx.interaction.options.getString('reason', true);
    if (!target) return;
    await ctx.interaction.deferReply();
    const outcome = await warnMember({
      guild: ctx.guild,
      targetId: target.id,
      moderator: ctx.member,
      reason,
    });
    if (!outcome.ok || !outcome.case) {
      await ctx.interaction.editReply({ content: '', embeds: [errorEmbed(describeModError(outcome, ctx.settings.language, target.tag))] });
      return;
    }
    const escalated = outcome.detail?.startsWith('escalated:') ? outcome.detail.split(':')[1] : null;
    const embed = successEmbed(`**${target.tag}** was warned. ${caseFooter(outcome.case.caseNumber)}`);
    if (escalated) {
      embed.addFields({ name: 'Escalation', value: `The warning escalation engine applied a **${escalated}**.` });
    }
    embed.addFields({ name: 'Reason', value: truncate(reason, 1000) });
    await ctx.interaction.editReply({ content: '', embeds: [embed] });
  },
};

export const timeoutCommand: BotCommand = {
  data: guildCommand('timeout', 'Timeout a member', PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName('user').setDescription('Member to timeout').setRequired(true))
    .addStringOption((option) =>
      option.setName('duration').setDescription('Duration (e.g. 10m, 1h, 1d — max 28d)').setRequired(true),
    )
    .addStringOption((option) => option.setName('reason').setDescription('Reason').setRequired(false).setMaxLength(1000)),
  category: 'moderation',
  botPermissions: [PermissionFlagsBits.ModerateMembers],
  async execute(ctx) {
    const target = await resolveTarget(ctx);
    if (!target) return;
    const durationInput = ctx.interaction.options.getString('duration', true);
    const reason = ctx.interaction.options.getString('reason') ?? 'No reason provided';
    const minutes = parseDurationMinutes(durationInput);
    if (minutes === null) {
      await ctx.interaction.reply({ embeds: [warnEmbed(ctx.t('common.invalidDuration'))], flags: MessageFlags.Ephemeral });
      return;
    }
    await ctx.interaction.deferReply();
    const outcome = await timeoutMember({
      guild: ctx.guild,
      targetId: target.id,
      minutes,
      reason,
      moderator: ctx.member,
    });
    if (!outcome.ok || !outcome.case) {
      await ctx.interaction.editReply({ content: '', embeds: [errorEmbed(describeModError(outcome, ctx.settings.language, target.tag))] });
      return;
    }
    await ctx.interaction.editReply({
      content: '',
      embeds: [successEmbed(`**${target.tag}** was timed out for **${formatDuration(minutes * 60_000)}**. ${caseFooter(outcome.case.caseNumber)}`)],
    });
  },
};

export const muteCommand: BotCommand = {
  data: guildCommand('mute', 'Timeout a member (alias of /timeout)', PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName('user').setDescription('Member to mute').setRequired(true))
    .addStringOption((option) => option.setName('duration').setDescription('Duration (e.g. 10m, 1h, 1d)').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason').setRequired(false).setMaxLength(1000)),
  category: 'moderation',
  botPermissions: [PermissionFlagsBits.ModerateMembers],
  async execute(ctx) {
    const target = await resolveTarget(ctx);
    if (!target) return;
    const durationInput = ctx.interaction.options.getString('duration', true);
    const reason = ctx.interaction.options.getString('reason') ?? 'No reason provided';
    const minutes = parseDurationMinutes(durationInput);
    if (minutes === null) {
      await ctx.interaction.reply({ embeds: [warnEmbed(ctx.t('common.invalidDuration'))], flags: MessageFlags.Ephemeral });
      return;
    }
    await ctx.interaction.deferReply();
    const outcome = await timeoutMember({ guild: ctx.guild, targetId: target.id, minutes, reason, moderator: ctx.member });
    if (!outcome.ok || !outcome.case) {
      await ctx.interaction.editReply({ content: '', embeds: [errorEmbed(describeModError(outcome, ctx.settings.language, target.tag))] });
      return;
    }
    await ctx.interaction.editReply({
      content: '',
      embeds: [successEmbed(`**${target.tag}** was muted for **${formatDuration(minutes * 60_000)}**. ${caseFooter(outcome.case.caseNumber)}`)],
    });
  },
};

export const unmuteCommand: BotCommand = {
  data: guildCommand('unmute', 'Remove a timeout from a member', PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName('user').setDescription('Member to unmute').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason').setRequired(false).setMaxLength(1000)),
  category: 'moderation',
  botPermissions: [PermissionFlagsBits.ModerateMembers],
  async execute(ctx) {
    const target = await resolveTarget(ctx);
    if (!target) return;
    const reason = ctx.interaction.options.getString('reason') ?? 'No reason provided';
    await ctx.interaction.deferReply();
    const outcome = await removeTimeout(ctx.guild, target.id, ctx.member, reason);
    if (!outcome.ok || !outcome.case) {
      await ctx.interaction.editReply({ content: '', embeds: [errorEmbed(describeModError(outcome, ctx.settings.language, target.tag))] });
      return;
    }
    await ctx.interaction.editReply({
      content: '',
      embeds: [successEmbed(`Timeout removed from **${target.tag}**. ${caseFooter(outcome.case.caseNumber)}`)],
    });
  },
};

export const kickCommand: BotCommand = {
  data: guildCommand('kick', 'Kick a member', PermissionFlagsBits.KickMembers)
    .addUserOption((option) => option.setName('user').setDescription('Member to kick').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason').setRequired(false).setMaxLength(1000)),
  category: 'moderation',
  botPermissions: [PermissionFlagsBits.KickMembers],
  async execute(ctx) {
    const target = await resolveTarget(ctx);
    if (!target) return;
    const reason = ctx.interaction.options.getString('reason') ?? 'No reason provided';
    await ctx.interaction.deferReply();
    const outcome = await kickMember({ guild: ctx.guild, targetId: target.id, reason, moderator: ctx.member });
    if (!outcome.ok || !outcome.case) {
      await ctx.interaction.editReply({ content: '', embeds: [errorEmbed(describeModError(outcome, ctx.settings.language, target.tag))] });
      return;
    }
    await ctx.interaction.editReply({
      content: '',
      embeds: [successEmbed(`**${target.tag}** was kicked. ${caseFooter(outcome.case.caseNumber)}`)],
    });
  },
};

registerConfirmHandler('mod:ban', async (interaction, data) => {
  const guild = interaction.guild;
  if (!guild) return;
  const targetId = String(data['targetId'] ?? '');
  const targetTag = String(data['targetTag'] ?? targetId);
  const reason = String(data['reason'] ?? 'No reason provided');
  const durationMinutes = data['durationMinutes'] !== undefined ? Number(data['durationMinutes']) : null;
  const moderator = interaction.member instanceof GuildMember ? interaction.member : null;

  const outcome = durationMinutes
    ? await tempbanMember({ guild, targetId, durationMinutes, reason, moderator })
    : await banMember({ guild, targetId, reason, moderator });
  if (!outcome.ok) {
    await interaction.reply({ embeds: [errorEmbed(describeModError(outcome))], flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({
    embeds: [
      successEmbed(
        `**${targetTag}** was ${durationMinutes ? `temp-banned for **${formatDuration(durationMinutes * 60_000)}**` : 'banned'}. ${caseFooter(outcome.case?.caseNumber)}`,
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
});

export const banCommand: BotCommand = {
  data: guildCommand('ban', 'Ban a member (optionally temporary)', PermissionFlagsBits.BanMembers)
    .addUserOption((option) => option.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason').setRequired(false).setMaxLength(1000))
    .addStringOption((option) =>
      option.setName('duration').setDescription('Optional duration — makes this a temporary ban (e.g. 7d)').setRequired(false),
    ),
  category: 'moderation',
  botPermissions: [PermissionFlagsBits.BanMembers],
  async execute(ctx) {
    const target = await resolveTarget(ctx);
    if (!target) return;
    const reason = ctx.interaction.options.getString('reason') ?? 'No reason provided';
    const durationInput = ctx.interaction.options.getString('duration');
    let durationMinutes: number | null = null;
    if (durationInput) {
      durationMinutes = parseDurationMinutes(durationInput);
      if (durationMinutes === null) {
        await ctx.interaction.reply({ embeds: [warnEmbed(ctx.t('common.invalidDuration'))], flags: MessageFlags.Ephemeral });
        return;
      }
    }
    await requestConfirmation(ctx.interaction, {
      kind: 'mod:ban',
      data: { targetId: target.id, targetTag: target.tag, reason, durationMinutes: durationMinutes ?? undefined },
      prompt: `${durationMinutes ? `Temp-ban **${target.tag}** for **${durationInput}**` : `Ban **${target.tag}** permanently`}?\nReason: ${truncate(reason, 500)}`,
    });
  },
};

export const unbanCommand: BotCommand = {
  data: guildCommand('unban', 'Unban a user', PermissionFlagsBits.BanMembers)
    .addStringOption((option) => option.setName('user_id').setDescription('ID of the user to unban').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason').setRequired(false).setMaxLength(1000)),
  category: 'moderation',
  botPermissions: [PermissionFlagsBits.BanMembers],
  async execute(ctx) {
    const targetId = ctx.interaction.options.getString('user_id', true).trim();
    if (!/^\d{15,21}$/.test(targetId)) {
      await ctx.interaction.reply({ embeds: [warnEmbed('Please provide a valid user ID.')] , flags: MessageFlags.Ephemeral });
      return;
    }
    const reason = ctx.interaction.options.getString('reason') ?? 'No reason provided';
    await ctx.interaction.deferReply();
    const { unbanMember } = await import('../../services/moderation');
    const outcome = await unbanMember(ctx.guild, targetId, ctx.member, reason);
    if (!outcome.ok || !outcome.case) {
      await ctx.interaction.editReply({ content: '', embeds: [errorEmbed(describeModError(outcome))] });
      return;
    }
    await ctx.interaction.editReply({
      content: '',
      embeds: [successEmbed(`<@${targetId}> was unbanned. ${caseFooter(outcome.case.caseNumber)}`)],
    });
  },
};

registerConfirmHandler('mod:softban', async (interaction, data) => {
  const guild = interaction.guild;
  if (!guild) return;
  const targetId = String(data['targetId'] ?? '');
  const targetTag = String(data['targetTag'] ?? targetId);
  const reason = String(data['reason'] ?? 'No reason provided');
  const moderator = interaction.member instanceof GuildMember ? interaction.member : null;
  const outcome = await softbanMember({ guild, targetId, reason, moderator });
  if (!outcome.ok) {
    await interaction.reply({ embeds: [errorEmbed(describeModError(outcome))], flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({
    embeds: [successEmbed(`**${targetTag}** was soft-banned (kicked + last 7 days of messages removed). ${caseFooter(outcome.case?.caseNumber)}`)],
    flags: MessageFlags.Ephemeral,
  });
});

export const softbanCommand: BotCommand = {
  data: guildCommand('softban', 'Ban a member and remove their recent messages, then unban', PermissionFlagsBits.BanMembers)
    .addUserOption((option) => option.setName('user').setDescription('Member to softban').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason').setRequired(false).setMaxLength(1000)),
  category: 'moderation',
  botPermissions: [PermissionFlagsBits.BanMembers],
  async execute(ctx) {
    const target = await resolveTarget(ctx);
    if (!target) return;
    const reason = ctx.interaction.options.getString('reason') ?? 'No reason provided';
    await requestConfirmation(ctx.interaction, {
      kind: 'mod:softban',
      data: { targetId: target.id, targetTag: target.tag, reason },
      prompt: `Soft-ban **${target.tag}** (kick + purge their last 7 days of messages)?\nReason: ${truncate(reason, 500)}`,
    });
  },
};
