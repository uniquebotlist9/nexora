import { MessageFlags } from 'discord.js';
import { brandEmbed, successEmbed, warnEmbed } from '@nexora/discord';
import { guildCommand } from '../../framework/builders';
import type { BotCommand } from '../../framework/types';
import {
  bankOperation,
  claimDaily,
  claimWeekly,
  doCrime,
  doWork,
  getAccount,
  getEconomyConfig,
  isEconomyUsable,
  robUser,
  transferFunds,
} from '../../services/economy';

async function ensureEconomy(ctx: Parameters<BotCommand['execute']>[0]): Promise<boolean> {
  if (await isEconomyUsable(ctx.guild.id)) return true;
  await ctx.interaction.reply({ embeds: [warnEmbed(ctx.t('economy.disabled'))], flags: MessageFlags.Ephemeral });
  return false;
}

export const balanceCommand: BotCommand = {
  data: guildCommand('balance', 'Show your wallet and bank balance').addUserOption((option) =>
    option.setName('user').setDescription('Member to inspect').setRequired(false),
  ),
  category: 'economy',
  cooldownSeconds: 5,
  async execute(ctx) {
    if (!(await ensureEconomy(ctx))) return;
    const { interaction, guild } = ctx;
    const target = interaction.options.getUser('user') ?? interaction.user;
    await interaction.deferReply(
      target.id !== interaction.user.id ? { flags: MessageFlags.Ephemeral } : undefined,
    );
    const [account, config] = await Promise.all([
      getAccount(guild.id, target.id),
      getEconomyConfig(guild.id),
    ]);
    await interaction.editReply({
      content: '',
      embeds: [
        brandEmbed()
          .setTitle(`${target.username}'s wallet`)
          .addFields(
            { name: 'Wallet', value: `${config.currencySymbol} **${account.balance}** ${config.currencyName}`, inline: true },
            { name: 'Bank', value: `${config.currencySymbol} **${account.bank}** ${config.currencyName}`, inline: true },
            { name: 'Net worth', value: `${config.currencySymbol} **${account.balance + account.bank}**`, inline: true },
          ),
      ],
    });
  },
};

export const bankCommand: BotCommand = {
  data: guildCommand('bank', 'Manage your bank account')
    .addSubcommand((sub) =>
      sub
        .setName('deposit')
        .setDescription('Deposit coins into your bank')
        .addIntegerOption((option) => option.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('withdraw')
        .setDescription('Withdraw coins from your bank')
        .addIntegerOption((option) => option.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)),
    ),
  category: 'economy',
  cooldownSeconds: 5,
  async execute(ctx) {
    if (!(await ensureEconomy(ctx))) return;
    const action = ctx.interaction.options.getSubcommand() as 'deposit' | 'withdraw';
    const amount = ctx.interaction.options.getInteger('amount', true);
    const result = await bankOperation(ctx.guild.id, ctx.interaction.user.id, action, amount);
    await ctx.interaction.reply({
      embeds: [result.ok ? successEmbed(result.message) : warnEmbed(result.message)],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export const dailyCommand: BotCommand = {
  data: guildCommand('daily', 'Claim your daily coins'),
  category: 'economy',
  cooldownSeconds: 10,
  async execute(ctx) {
    if (!(await ensureEconomy(ctx))) return;
    const result = await claimDaily(ctx.guild.id, ctx.interaction.user.id);
    await ctx.interaction.reply({
      embeds: [result.ok ? successEmbed(result.message) : warnEmbed(result.message)],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export const weeklyCommand: BotCommand = {
  data: guildCommand('weekly', 'Claim your weekly coins'),
  category: 'economy',
  cooldownSeconds: 10,
  async execute(ctx) {
    if (!(await ensureEconomy(ctx))) return;
    const result = await claimWeekly(ctx.guild.id, ctx.interaction.user.id);
    await ctx.interaction.reply({
      embeds: [result.ok ? successEmbed(result.message) : warnEmbed(result.message)],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export const workCommand: BotCommand = {
  data: guildCommand('work', 'Work for coins'),
  category: 'economy',
  cooldownSeconds: 10,
  async execute(ctx) {
    if (!(await ensureEconomy(ctx))) return;
    const result = await doWork(ctx.guild.id, ctx.interaction.user.id);
    await ctx.interaction.reply({
      embeds: [result.ok ? successEmbed(result.message) : warnEmbed(result.message)],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export const crimeCommand: BotCommand = {
  data: guildCommand('crime', 'Attempt a heist for coins (risky!)'),
  category: 'economy',
  cooldownSeconds: 10,
  async execute(ctx) {
    if (!(await ensureEconomy(ctx))) return;
    const result = await doCrime(ctx.guild.id, ctx.interaction.user.id);
    await ctx.interaction.reply({
      embeds: [result.ok ? successEmbed(result.message) : warnEmbed(result.message)],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export const robCommand: BotCommand = {
  data: guildCommand('rob', 'Try to rob another member')
    .addUserOption((option) => option.setName('user').setDescription('Member to rob').setRequired(true)),
  category: 'economy',
  cooldownSeconds: 10,
  async execute(ctx) {
    if (!(await ensureEconomy(ctx))) return;
    const target = ctx.interaction.options.getUser('user', true);
    if (target.bot) {
      await ctx.interaction.reply({ embeds: [warnEmbed('You cannot rob bots.')] , flags: MessageFlags.Ephemeral });
      return;
    }
    const result = await robUser(ctx.guild.id, ctx.interaction.user.id, target.id);
    await ctx.interaction.reply({
      embeds: [result.ok ? successEmbed(result.message) : warnEmbed(result.message)],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export const payCommand: BotCommand = {
  data: guildCommand('pay', 'Transfer coins to another member')
    .addUserOption((option) => option.setName('user').setDescription('Recipient').setRequired(true))
    .addIntegerOption((option) => option.setName('amount').setDescription('Amount to send').setRequired(true).setMinValue(1)),
  category: 'economy',
  cooldownSeconds: 5,
  async execute(ctx) {
    if (!(await ensureEconomy(ctx))) return;
    const target = ctx.interaction.options.getUser('user', true);
    const amount = ctx.interaction.options.getInteger('amount', true);
    const result = await transferFunds(ctx.guild.id, ctx.interaction.user.id, target.id, amount);
    await ctx.interaction.reply({
      embeds: [result.ok ? successEmbed(result.message) : warnEmbed(result.message)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
