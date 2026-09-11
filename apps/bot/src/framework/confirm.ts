import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
  type InteractionReplyOptions,
  type RepliableInteraction,
} from 'discord.js';
import { errorEmbed, successEmbed, warnEmbed } from '@nexora/discord';
import { registerComponentHandler } from './router';
import { getContext } from '../core/context';
import { t } from '../core/i18n';
import { newId } from '../core/utils';

/**
 * Generic confirmation flow for destructive actions (purge, ban, backup
 * restore, ...). A short-lived token stored in the cache links the buttons
 * to the pending action, so customIds stay short and nothing sensitive is
 * exposed in them.
 */
export interface ConfirmationRequest {
  /** What is being confirmed — routes to the matching registered handler. */
  kind: string;
  /** JSON-serializable payload handed back to the handler. */
  data: Record<string, unknown>;
  /** Body text of the confirmation prompt (shown under the warning header). */
  prompt: string;
  /** Seconds until the confirmation expires. */
  timeoutSeconds?: number;
}

type ConfirmHandler = (interaction: ButtonInteraction, data: Record<string, unknown>) => Promise<void>;

const confirmHandlers = new Map<string, ConfirmHandler>();

export function registerConfirmHandler(kind: string, handler: ConfirmHandler): void {
  confirmHandlers.set(kind, handler);
}

interface StoredConfirmation {
  kind: string;
  userId: string;
  data: Record<string, unknown>;
}

export async function requestConfirmation(
  interaction: RepliableInteraction,
  request: ConfirmationRequest,
): Promise<void> {
  const timeout = request.timeoutSeconds ?? 120;
  const token = newId();
  const { cache } = getContext();
  await cache.set(
    `confirm:${token}`,
    JSON.stringify({
      kind: request.kind,
      userId: interaction.user.id,
      data: request.data,
    } satisfies StoredConfirmation),
    timeout,
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`confirm:${token}:ok`).setLabel('Confirm').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`confirm:${token}:cancel`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );

  const payload: InteractionReplyOptions = {
    embeds: [warnEmbed(`${t('common.confirmPrompt', { seconds: timeout })}\n\n${request.prompt}`)],
    components: [row],
    flags: MessageFlags.Ephemeral,
  };

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}

function parseStored(raw: string | null): StoredConfirmation | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredConfirmation;
  } catch {
    return null;
  }
}

registerComponentHandler('confirm', async (interaction, parts) => {
  if (!interaction.isButton()) return;
  const decision = parts[2];
  const token = parts[1] ?? '';
  const { cache } = getContext();
  const stored = parseStored(await cache.get(`confirm:${token}`));
  if (!stored) {
    await interaction
      .reply({ embeds: [errorEmbed('This confirmation has expired. Please run the command again.')], flags: MessageFlags.Ephemeral })
      .catch(() => undefined);
    return;
  }
  if (stored.userId !== interaction.user.id) {
    await interaction
      .reply({ embeds: [errorEmbed(t('common.noPermission'))], flags: MessageFlags.Ephemeral })
      .catch(() => undefined);
    return;
  }
  await cache.del(`confirm:${token}`);

  if (decision !== 'ok') {
    await interaction
      .reply({ embeds: [successEmbed(t('common.cancelled'))], flags: MessageFlags.Ephemeral })
      .catch(() => undefined);
    return;
  }

  const handler = confirmHandlers.get(stored.kind);
  if (!handler) {
    await interaction
      .reply({ embeds: [errorEmbed('Unknown confirmation type.')], flags: MessageFlags.Ephemeral })
      .catch(() => undefined);
    return;
  }
  await handler(interaction, stored.data);
});
