import { MessageFlags, type Interaction } from 'discord.js';
import { warnEmbed } from '@nexora/discord';
import { handleCommand } from '../framework/handler';
import { routeComponent } from '../framework/router';
import type { BotEvent } from '../framework/types';

/**
 * Interaction router: chat input commands go to the command handler, all
 * namespaced component interactions (buttons / select menus / modals with a
 * "prefix:..." customId) go to the component router.
 */
export const interactionCreateEvent: BotEvent<'interactionCreate'> = {
  name: 'interactionCreate',
  async execute(interaction: Interaction) {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
      return;
    }

    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
      if (!interaction.customId.includes(':')) return;
      const handled = await routeComponent(interaction);
      if (!handled) {
        await interaction
          .reply({
            embeds: [warnEmbed('This interaction is no longer available. Please run the command again.')],
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => undefined);
      }
    }
  },
};
