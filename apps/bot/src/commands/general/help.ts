import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ButtonInteraction,
} from 'discord.js';
import { brandEmbed, errorEmbed, infoEmbed, warnEmbed } from '@nexora/discord';
import { guildCommand } from '../../framework/builders';
import { registerComponentHandler } from '../../framework/router';
import type { BotCommand, CommandCategory } from '../../framework/types';
import { allCommands, categoryMeta } from '../registry';

const COMMANDS_PER_PAGE = 6;

function categoryCommands(category: CommandCategory) {
  return allCommands.filter((command) => command.category === category);
}

function buildHomeEmbed() {
  return infoEmbed(
    '**Nexora** — a modular Discord platform for moderation, automation and community growth.\n\n' +
      'Pick a category below to see its commands, or use `/help search:<term>` to find a command by name.',
  ).setTitle('Nexora help');
}

function buildCategoryEmbed(category: CommandCategory, page: number) {
  const meta = categoryMeta[category];
  const commands = categoryCommands(category);
  const pageCount = Math.max(1, Math.ceil(commands.length / COMMANDS_PER_PAGE));
  const safePage = Math.min(Math.max(page, 0), pageCount - 1);
  const slice = commands.slice(safePage * COMMANDS_PER_PAGE, (safePage + 1) * COMMANDS_PER_PAGE);

  const embed = brandEmbed()
    .setTitle(`${meta.emoji} ${meta.label} — commands`)
    .setDescription(meta.description);
  if (slice.length === 0) {
    embed.addFields({ name: 'No commands', value: 'Nothing here yet.' });
  }
  for (const command of slice) {
    embed.addFields({
      name: `/${command.data.name}`,
      value: command.data.description.slice(0, 200),
      inline: true,
    });
  }
  if (pageCount > 1) {
    embed.setFooter({ text: `Page ${safePage + 1}/${pageCount} • ${commands.length} commands` });
  }
  return { embed, pageCount, page: safePage };
}

function buildCategoryRow(category: CommandCategory, page: number, userId: string) {
  const commands = categoryCommands(category);
  const pageCount = Math.max(1, Math.ceil(commands.length / COMMANDS_PER_PAGE));
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`help:home:${userId}`).setLabel('Home').setStyle(ButtonStyle.Secondary).setEmoji('🏠'),
    new ButtonBuilder().setCustomId(`help:prev:${category}:${page}:${userId}`).setLabel('Previous').setStyle(ButtonStyle.Primary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(`help:next:${category}:${page}:${userId}`).setLabel('Next').setStyle(ButtonStyle.Primary).setDisabled(page >= pageCount - 1),
  );
}

// The owner id in the customId lets the router reject members who try to
// navigate a help menu someone else invoked.
function buildHomeRow(userId: string) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`help:menu:${userId}`)
    .setPlaceholder('Choose a category…')
    .addOptions(
      ...Object.values(categoryMeta).map((meta) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(meta.label)
          .setValue(meta.name)
          .setDescription(meta.description.slice(0, 100))
          .setEmoji(meta.emoji),
      ),
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

registerComponentHandler('help', async (interaction, parts) => {
  const action = parts[1];
  const ownerUserId = parts[parts.length - 1];
  if (ownerUserId && ownerUserId !== interaction.user.id) {
    await interaction
      .reply({ embeds: [errorEmbed('This help menu belongs to someone else — run /help yourself.')], flags: MessageFlags.Ephemeral })
      .catch(() => undefined);
    return;
  }

  if (interaction.isStringSelectMenu() && action === 'menu') {
    const category = interaction.values[0] as CommandCategory;
    if (!categoryMeta[category]) return;
    await interaction
      .update({ embeds: [buildCategoryEmbed(category, 0).embed], components: [buildHomeRow(interaction.user.id), buildCategoryRow(category, 0, interaction.user.id)] })
      .catch(() => undefined);
    return;
  }

  if (interaction.isButton() && action === 'home') {
    await interaction
      .update({ embeds: [buildHomeEmbed()], components: [buildHomeRow(interaction.user.id)] })
      .catch(() => undefined);
    return;
  }

  if (interaction.isButton() && (action === 'prev' || action === 'next')) {
    const category = parts[2] as CommandCategory;
    const page = Number.parseInt(parts[3] ?? '0', 10) || 0;
    if (!categoryMeta[category]) return;
    const nextPage = action === 'next' ? page + 1 : page - 1;
    const { embed } = buildCategoryEmbed(category, nextPage);
    await interaction
      .update({ embeds: [embed], components: [buildHomeRow(interaction.user.id), buildCategoryRow(category, nextPage, interaction.user.id)] })
      .catch(() => undefined);
    return;
  }

  if (interaction.isButton()) {
    const unhandled: ButtonInteraction = interaction;
    await unhandled
      .reply({ embeds: [warnEmbed('Unknown help action.')], flags: MessageFlags.Ephemeral })
      .catch(() => undefined);
  }
});

export const helpCommand: BotCommand = {
  data: guildCommand('help', 'Browse all Nexora commands by category').addStringOption((option) =>
    option.setName('search').setDescription('Search commands by name or description').setRequired(false),
  ),
  category: 'general',
  async execute(ctx) {
    const { interaction } = ctx;
    const search = interaction.options.getString('search')?.trim().toLowerCase();

    if (search) {
      const matches = allCommands.filter(
        (command) =>
          command.data.name.includes(search) ||
          command.data.description.toLowerCase().includes(search),
      );
      if (matches.length === 0) {
        await interaction.reply({ embeds: [warnEmbed(`No commands match **${search}**.`)] });
        return;
      }
      const embed = infoEmbed(
        matches.slice(0, 15).map((command) => `\`/${command.data.name}\` — ${command.data.description}`).join('\n'),
      ).setTitle(`🔎 Search results for "${search}"`);
      await interaction.reply({ embeds: [embed] });
      return;
    }

    await interaction.reply({
      embeds: [buildHomeEmbed()],
      components: [buildHomeRow(interaction.user.id)],
    });
  },
};
