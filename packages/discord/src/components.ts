import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type APIButtonComponent,
  type BaseMessageOptions,
} from 'discord.js';
import type { MessagePayload } from '@nexora/types';
import { buildEmbed } from './embeds';
import { parseTemplate, type TemplateContext } from './template';

/** Convert a stored MessagePayload (DB / dashboard) into discord.js message options. */
export function toMessageOptions(
  payload: MessagePayload,
  context: TemplateContext = {},
): BaseMessageOptions {
  const options: BaseMessageOptions = {};
  if (payload.content) options.content = parseTemplate(payload.content, context).slice(0, 2000);
  const embed = buildEmbed(
    payload.embed
      ? {
          ...payload.embed,
          ...(payload.embed.description
            ? { description: parseTemplate(payload.embed.description, context).slice(0, 4096) }
            : {}),
          ...(payload.embed.title ? { title: parseTemplate(payload.embed.title, context).slice(0, 256) } : {}),
        }
      : null,
  );
  if (embed) options.embeds = [embed];
  if (payload.buttons?.length) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const button of payload.buttons.slice(0, 5)) {
      const builder = new ButtonBuilder()
        .setLabel(button.label.slice(0, 80))
        .setStyle(BUTTON_STYLE_MAP[button.style] ?? ButtonStyle.Secondary);
      if (button.style === 'LINK' && button.url) builder.setURL(button.url);
      if (button.emoji) builder.setEmoji(button.emoji);
      row.addComponents(builder);
    }
    options.components = [row];
  }
  return options;
}

const BUTTON_STYLE_MAP: Record<string, ButtonStyle> = {
  PRIMARY: ButtonStyle.Primary,
  SECONDARY: ButtonStyle.Secondary,
  SUCCESS: ButtonStyle.Success,
  DANGER: ButtonStyle.Danger,
  LINK: ButtonStyle.Link,
};

/** Format a duration in milliseconds as a human string ("2d 4h 30m"). */
export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const seconds = Math.floor(ms / 1000);
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!d && !h && s) parts.push(`${s}s`);
  return parts.join(' ') || '0s';
}

/** Extract a timestamp from a Discord snowflake ID. */
export function snowflakeToDate(id: string): Date {
  const DISCORD_EPOCH = 1420070400000;
  return new Date(Number(BigInt(id) >> 22n) + DISCORD_EPOCH);
}

/** Convert raw API button data back into an interactive builder. */
export function buttonFromApi(data: APIButtonComponent): ButtonBuilder {
  return ButtonBuilder.from(data);
}
