import type {
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';

export type ComponentInteraction = ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;
export type ComponentHandler = (interaction: ComponentInteraction, parts: string[]) => Promise<void>;

/**
 * Persistent component router. Interactive customIds are namespaced by their
 * first colon-separated segment (e.g. "ticket:close", "giveaway:enter",
 * "verification:button", "rr:select") and dispatched to the handler that
 * registered the prefix. Because routing is stateless, buttons keep working
 * across restarts.
 */
const handlers = new Map<string, ComponentHandler>();

export function registerComponentHandler(prefix: string, handler: ComponentHandler): void {
  handlers.set(prefix, handler);
}

/**
 * Route a component/modal interaction. Returns false when no handler matches
 * (the interaction is then answered with a generic "expired" reply).
 */
export async function routeComponent(interaction: ComponentInteraction): Promise<boolean> {
  const parts = interaction.customId.split(':');
  const prefix = parts[0];
  if (!prefix) return false;
  const handler = handlers.get(prefix);
  if (!handler) return false;
  await handler(interaction, parts);
  return true;
}
