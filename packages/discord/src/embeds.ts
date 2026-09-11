import { EmbedBuilder } from 'discord.js';
import type { EmbedData } from '@nexora/types';

export const BRAND_COLOR = 0x5865f2;
export const SUCCESS_COLOR = 0x57f287;
export const WARNING_COLOR = 0xfee75c;
export const DANGER_COLOR = 0xed4245;
export const INFO_COLOR = 0x5865f2;

/** Build a discord.js EmbedBuilder from the shared serializable EmbedData shape. */
export function buildEmbed(data?: EmbedData | null): EmbedBuilder | null {
  if (!data) return null;
  const embed = new EmbedBuilder();
  if (data.title) embed.setTitle(data.title.slice(0, 256));
  if (data.description) embed.setDescription(data.description.slice(0, 4096));
  if (data.url) embed.setURL(data.url);
  if (typeof data.color === 'number') embed.setColor(data.color);
  if (data.fields?.length) {
    embed.setFields(
      data.fields.slice(0, 25).map((f) => ({
        name: f.name.slice(0, 256),
        value: f.value.slice(0, 1024),
        inline: f.inline ?? false,
      })),
    );
  }
  if (data.author) {
    embed.setAuthor({
      name: data.author.name.slice(0, 256),
      ...(data.author.url ? { url: data.author.url } : {}),
      ...(data.author.iconUrl ? { iconURL: data.author.iconUrl } : {}),
    });
  }
  if (data.footer) {
    embed.setFooter({
      text: data.footer.text.slice(0, 2048),
      ...(data.footer.iconUrl ? { iconURL: data.footer.iconUrl } : {}),
    });
  }
  if (data.image) embed.setImage(data.image);
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  if (data.timestamp) embed.setTimestamp(new Date());
  return embed;
}

export function successEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(SUCCESS_COLOR).setDescription(`✅ ${message}`);
}

export function errorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(DANGER_COLOR).setDescription(`❌ ${message}`);
}

export function warnEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(WARNING_COLOR).setDescription(`⚠️ ${message}`);
}

export function infoEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder().setColor(INFO_COLOR).setDescription(message);
}

export function brandEmbed(): EmbedBuilder {
  return new EmbedBuilder().setColor(BRAND_COLOR).setFooter({ text: 'Nexora • Powerful Automation. Smarter Communities.' });
}
