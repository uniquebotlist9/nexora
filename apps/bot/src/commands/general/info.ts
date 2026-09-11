import { type ChatInputCommandInteraction, type User } from 'discord.js';
import { prisma } from '@nexora/database';
import { brandEmbed, snowflakeToDate } from '@nexora/discord';
import { guildCommand } from '../../framework/builders';
import type { BotCommand, CommandContext } from '../../framework/types';
import { formatDate } from '../../core/utils';

async function showServerInfo(ctx: CommandContext): Promise<void> {
  const { interaction, guild } = ctx;
  await interaction.deferReply();
  const [channels, roles] = [guild.channels.cache.size, guild.roles.cache.size];
  const embed = brandEmbed()
    .setTitle(guild.name)
    .setThumbnail(guild.iconURL({ size: 256 }) ?? null)
    .addFields(
      { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
      { name: 'Members', value: String(guild.memberCount), inline: true },
      { name: 'Created', value: formatDate(snowflakeToDate(guild.id)), inline: true },
      { name: 'Channels', value: String(channels), inline: true },
      { name: 'Roles', value: String(roles), inline: true },
      { name: 'Boosts', value: `${guild.premiumSubscriptionCount ?? 0} (level ${guild.premiumTier})`, inline: true },
      { name: 'Server ID', value: guild.id, inline: true },
      { name: 'Nexora plan', value: 'Manage on the dashboard', inline: true },
    )
    .setTimestamp(new Date());
  await interaction.editReply({ embeds: [embed] }).catch(() => undefined);
}

async function showUserInfo(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  await interaction.deferReply();
  const target: User = interaction.options.getUser('user') ?? interaction.user;
  const member = await guild.members.fetch(target.id).catch(() => null);

  const embed = brandEmbed()
    .setTitle(member?.displayName ?? target.username)
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'Username', value: target.tag, inline: true },
      { name: 'User ID', value: target.id, inline: true },
      { name: 'Bot', value: target.bot ? 'Yes' : 'No', inline: true },
      { name: 'Account created', value: formatDate(target.createdAt), inline: true },
    );
  if (member?.joinedAt) {
    embed.addFields({ name: 'Joined server', value: formatDate(member.joinedAt), inline: true });
  }
  if (member) {
    const roleList = member.roles.cache
      .filter((role) => role.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map((role) => `<@&${role.id}>`)
      .slice(0, 15)
      .join(' ');
    embed.addFields({ name: `Roles (${member.roles.cache.size - 1})`, value: roleList || 'None' });
  }
  await interaction.editReply({ embeds: [embed] }).catch(() => undefined);
}

async function showAvatar(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser('user') ?? interaction.user;
  const url = target.displayAvatarURL({ size: 1024 });
  const embed = brandEmbed()
    .setTitle(`${target.username}'s avatar`)
    .setImage(url);
  await interaction.reply({ embeds: [embed] });
}

async function showProfile(ctx: CommandContext): Promise<void> {
  const { interaction, guild } = ctx;
  await interaction.deferReply();
  const target = interaction.options.getUser('user') ?? interaction.user;

  const [memberRow, economyAccount, warningCount, ticketCount] = await Promise.all([
    prisma.guildMember.findUnique({
      where: { userId_guildId: { userId: target.id, guildId: guild.id } },
      include: { level: true },
    }),
    prisma.economyAccount.findUnique({
      where: { userId_guildId: { userId: target.id, guildId: guild.id } },
    }),
    prisma.warning.count({ where: { guildId: guild.id, userId: target.id, active: true } }),
    prisma.ticket.count({ where: { guildId: guild.id, creator: { userId: target.id } } }),
  ]);

  const level = memberRow?.level;
  const embed = brandEmbed()
    .setTitle(`${target.username}'s profile`)
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'Level', value: String(level?.level ?? 0), inline: true },
      { name: 'Total XP', value: String(memberRow?.xp ?? 0), inline: true },
      { name: 'Messages', value: String(memberRow?.messageCount ?? 0), inline: true },
      { name: 'Voice minutes', value: String(memberRow?.voiceMinutes ?? 0), inline: true },
      { name: 'Wallet', value: String(economyAccount?.balance ?? 0), inline: true },
      { name: 'Bank', value: String(economyAccount?.bank ?? 0), inline: true },
      { name: 'Active warnings', value: String(warningCount), inline: true },
      { name: 'Tickets opened', value: String(ticketCount), inline: true },
    )
    .setTimestamp(new Date());
  await interaction.editReply({ embeds: [embed] }).catch(() => undefined);
}

export const serverinfoCommand: BotCommand = {
  data: guildCommand('serverinfo', 'Show information about this server'),
  category: 'general',
  async execute(ctx) {
    await showServerInfo(ctx);
  },
};

export const userinfoCommand: BotCommand = {
  data: guildCommand('userinfo', 'Show information about a member').addUserOption((option) =>
    option.setName('user').setDescription('Member to inspect').setRequired(false),
  ),
  category: 'general',
  async execute(ctx) {
    await showUserInfo(ctx.interaction);
  },
};

export const avatarCommand: BotCommand = {
  data: guildCommand('avatar', "Show a member's avatar").addUserOption((option) =>
    option.setName('user').setDescription('Member whose avatar to show').setRequired(false),
  ),
  category: 'general',
  async execute(ctx) {
    await showAvatar(ctx.interaction);
  },
};

export const profileCommand: BotCommand = {
  data: guildCommand('profile', 'Show your (or another member’s) Nexora profile').addUserOption((option) =>
    option.setName('user').setDescription('Member to inspect').setRequired(false),
  ),
  category: 'general',
  cooldownSeconds: 5,
  async execute(ctx) {
    await showProfile(ctx);
  },
};
