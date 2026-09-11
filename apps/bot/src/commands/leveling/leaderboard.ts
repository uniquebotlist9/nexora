import { brandEmbed } from '@nexora/discord';
import { prisma } from '@nexora/database';
import { guildCommand } from '../../framework/builders';
import type { BotCommand } from '../../framework/types';
import { getRank, getLeaderboard } from '../../services/leveling';
import { getEconomyConfig, isEconomyUsable } from '../../services/economy';
import { getContext } from '../../core/context';
import { progressBar } from '../../core/utils';

export const rankCommand: BotCommand = {
  data: guildCommand('rank', 'Show your (or another member’s) XP rank').addUserOption((option) =>
    option.setName('user').setDescription('Member to inspect').setRequired(false),
  ),
  category: 'leveling',
  cooldownSeconds: 5,
  async execute(ctx) {
    const target = ctx.interaction.options.getUser('user') ?? ctx.interaction.user;
    await ctx.interaction.deferReply();

    const rank = await getRank(ctx.guild.id, target.id);
    if (!rank) {
      await ctx.interaction.editReply({
        content: '',
        embeds: [brandEmbed().setDescription(`**${target.username}** has not earned any XP yet — start chatting to level up!`)],
      });
      return;
    }

    const embed = brandEmbed()
      .setTitle(`${target.username}'s rank`)
      .setThumbnail(target.displayAvatarURL({ size: 128 }))
      .addFields(
        { name: 'Level', value: String(rank.level), inline: true },
        { name: 'Rank', value: `#${rank.position}`, inline: true },
        { name: 'Total XP', value: String(rank.xp), inline: true },
        {
          name: `Progress to level ${rank.level + 1}`,
          value: `${progressBar(rank.levelXp, rank.nextLevelXp)}\n${rank.levelXp} / ${rank.nextLevelXp} XP`,
        },
      );
    await ctx.interaction.editReply({ content: '', embeds: [embed] });
  },
};

export const leaderboardCommand: BotCommand = {
  data: guildCommand('leaderboard', 'Show the server leaderboard')
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Leaderboard type')
        .setRequired(false)
        .addChoices({ name: 'XP', value: 'xp' }, { name: 'Economy', value: 'economy' }, { name: 'Voice', value: 'voice' }),
    ),
  category: 'leveling',
  cooldownSeconds: 5,
  async execute(ctx) {
    const type = ctx.interaction.options.getString('type') ?? 'xp';
    await ctx.interaction.deferReply();
    const { client } = getContext();

    async function displayName(userId: string): Promise<string> {
      const user = await client.users.fetch(userId).catch(() => null);
      return user?.username ?? `<@${userId}>`;
    }

    if (type === 'economy') {
      if (!(await isEconomyUsable(ctx.guild.id))) {
        await ctx.interaction.editReply({ content: '', embeds: [brandEmbed().setDescription('The economy system is disabled here.')] });
        return;
      }
      const config = await getEconomyConfig(ctx.guild.id);
      const accounts = await prisma.economyAccount.findMany({
        where: { guildId: ctx.guild.id },
        orderBy: { balance: 'desc' },
        take: 10,
        select: { userId: true, balance: true },
      });
      const lines: string[] = [];
      for (let i = 0; i < accounts.length; i += 1) {
        const account = accounts[i];
        lines.push(`**${i + 1}.** ${await displayName(account.userId)} — ${account.balance} ${config.currencyName}`);
      }
      await ctx.interaction.editReply({
        content: '',
        embeds: [brandEmbed().setTitle(`💰 Economy leaderboard`).setDescription(lines.join('\n') || 'No accounts yet.')],
      });
      return;
    }

    if (type === 'voice') {
      const members = await prisma.guildMember.findMany({
        where: { guildId: ctx.guild.id, leftAt: null, voiceMinutes: { gt: 0 } },
        orderBy: { voiceMinutes: 'desc' },
        take: 10,
        select: { userId: true, voiceMinutes: true },
      });
      const lines = await Promise.all(
        members.map(async (member, index) => `**${index + 1}.** ${await displayName(member.userId)} — ${member.voiceMinutes} min`),
      );
      await ctx.interaction.editReply({
        content: '',
        embeds: [brandEmbed().setTitle('🎤 Voice leaderboard').setDescription(lines.join('\n') || 'No voice activity yet.')],
      });
      return;
    }

    const top = await getLeaderboard(ctx.guild.id, 10);
    const lines = await Promise.all(
      top.map(async (entry, index) => `**${index + 1}.** ${await displayName(entry.userId)} — ${entry.xp} XP`),
    );
    await ctx.interaction.editReply({
      content: '',
      embeds: [brandEmbed().setTitle('🏆 XP leaderboard').setDescription(lines.join('\n') || 'No XP earned yet.')],
    });
  },
};

