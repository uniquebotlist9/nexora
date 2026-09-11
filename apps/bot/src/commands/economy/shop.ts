import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { prisma } from '@nexora/database';
import { brandEmbed, successEmbed, warnEmbed } from '@nexora/discord';
import { guildCommand } from '../../framework/builders';
import type { BotCommand } from '../../framework/types';
import { buyShopItem, getAccount, getEconomyConfig, isEconomyUsable, listShopItems, parseInventory } from '../../services/economy';

export const shopCommand: BotCommand = {
  data: guildCommand('shop', 'Browse or manage the server shop')
    .addSubcommand((sub) => sub.setName('list').setDescription('Browse the shop'))
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a shop item (staff)')
        .addStringOption((option) => option.setName('name').setDescription('Item name').setRequired(true).setMaxLength(100))
        .addIntegerOption((option) => option.setName('price').setDescription('Price').setRequired(true).setMinValue(1))
        .addStringOption((option) => option.setName('description').setDescription('Description').setRequired(false).setMaxLength(500))
        .addRoleOption((option) => option.setName('role').setDescription('Role granted on purchase').setRequired(false))
        .addIntegerOption((option) => option.setName('stock').setDescription('Stock limit (blank = unlimited)').setRequired(false).setMinValue(1))
        .addIntegerOption((option) => option.setName('max_per_user').setDescription('Purchase limit per user').setRequired(false).setMinValue(1).setMaxValue(100)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a shop item (staff)')
        .addStringOption((option) => option.setName('name').setDescription('Item name').setRequired(true).setMaxLength(100)),
    ),
  category: 'economy',
  cooldownSeconds: 5,
  async execute(ctx) {
    const { interaction, guild } = ctx;
    const sub = interaction.options.getSubcommand();

    if (sub === 'add' || sub === 'remove') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ embeds: [warnEmbed(ctx.t('common.noPermission'))], flags: MessageFlags.Ephemeral });
        return;
      }
    }

    if (!(await isEconomyUsable(guild.id))) {
      await interaction.reply({ embeds: [warnEmbed(ctx.t('economy.disabled'))], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'add') {
      const name = interaction.options.getString('name', true).trim();
      const price = interaction.options.getInteger('price', true);
      const role = interaction.options.getRole('role');
      if (role) {
        const me = guild.members.me;
        if (!me?.permissions.has(PermissionFlagsBits.ManageRoles) || role.position >= me.roles.highest.position) {
          await interaction.reply({ embeds: [warnEmbed(`I cannot grant **${role.name}** — it is above my highest role.`)], flags: MessageFlags.Ephemeral });
          return;
        }
      }
      const existing = await prisma.shopItem.findUnique({ where: { guildId_name: { guildId: guild.id, name } } });
      if (existing) {
        await prisma.shopItem.update({
          where: { id: existing.id },
          data: {
            price,
            description: interaction.options.getString('description') ?? existing.description,
            roleId: role?.id ?? existing.roleId,
            stock: interaction.options.getInteger('stock') ?? existing.stock,
            maxPerUser: interaction.options.getInteger('max_per_user') ?? existing.maxPerUser,
            enabled: true,
          },
        });
        await interaction.reply({ embeds: [successEmbed(`Updated shop item **${name}**.`)], flags: MessageFlags.Ephemeral });
        return;
      }
      await prisma.shopItem.create({
        data: {
          guildId: guild.id,
          name,
          price,
          description: interaction.options.getString('description') ?? '',
          roleId: role?.id ?? null,
          stock: interaction.options.getInteger('stock') ?? null,
          maxPerUser: interaction.options.getInteger('max_per_user') ?? 1,
        },
      });
      await interaction.reply({ embeds: [successEmbed(`Added **${name}** to the shop for **${price}**.`)], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'remove') {
      const name = interaction.options.getString('name', true).trim();
      const deleted = await prisma.shopItem.deleteMany({ where: { guildId: guild.id, name } });
      await interaction.reply({
        embeds: [deleted.count > 0 ? successEmbed('Item removed.') : warnEmbed('No item with that name.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // list
    await interaction.deferReply();
    const [items, config] = await Promise.all([listShopItems(guild.id), getEconomyConfig(guild.id)]);
    await interaction.editReply({
      content: '',
      embeds: [
        brandEmbed()
          .setTitle(`🛒 ${guild.name} shop`)
          .setDescription(
            items.length === 0
              ? 'The shop is empty. Staff can add items with /shop add.'
              : items
                  .map(
                    (item) =>
                      `**${item.name}** — ${config.currencySymbol}${item.price}\n${item.description || 'No description'}` +
                      (item.roleId ? `\n*Grants <@&${item.roleId}>*` : '') +
                      (item.stock !== null ? `\n*Stock: ${item.stock}*` : ''),
                  )
                  .join('\n\n')
                  .slice(0, 4000),
          ),
      ],
    });
  },
};

export const buyCommand: BotCommand = {
  data: guildCommand('buy', 'Buy an item from the shop').addStringOption((option) =>
    option.setName('name').setDescription('Item name').setRequired(true).setMaxLength(100),
  ),
  category: 'economy',
  cooldownSeconds: 5,
  async execute(ctx) {
    if (!(await isEconomyUsable(ctx.guild.id))) {
      await ctx.interaction.reply({ embeds: [warnEmbed(ctx.t('economy.disabled'))], flags: MessageFlags.Ephemeral });
      return;
    }
    const name = ctx.interaction.options.getString('name', true).trim();
    const result = await buyShopItem(ctx.guild, ctx.interaction.user.id, name);
    await ctx.interaction.reply({
      embeds: [result.ok ? successEmbed(result.message) : warnEmbed(result.message)],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export const inventoryCommand: BotCommand = {
  data: guildCommand('inventory', 'Show purchased shop items').addUserOption((option) =>
    option.setName('user').setDescription('Member to inspect').setRequired(false),
  ),
  category: 'economy',
  cooldownSeconds: 5,
  async execute(ctx) {
    if (!(await isEconomyUsable(ctx.guild.id))) {
      await ctx.interaction.reply({ embeds: [warnEmbed(ctx.t('economy.disabled'))], flags: MessageFlags.Ephemeral });
      return;
    }
    const target = ctx.interaction.options.getUser('user') ?? ctx.interaction.user;
    const account = await getAccount(ctx.guild.id, target.id);
    const inventory = parseInventory(account);
    await ctx.interaction.reply({
      embeds: [
        brandEmbed()
          .setTitle(`${target.username}'s inventory`)
          .setDescription(
            inventory.length === 0 ? 'Nothing here yet — check out /shop.' : inventory.map((item) => `**${item.name}** ×${item.quantity}`).join('\n'),
          ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
