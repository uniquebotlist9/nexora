import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Prisma } from '@nexora/database';

/** Inclusive random integer between min and max. */
export function randomInt(min: number, max: number): number {
  if (max < min) [min, max] = [max, min];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Parse a human duration string into minutes.
 * Accepts "30" (minutes), "30m", "2h", "4d", "1w" and combinations like "1h30m".
 * Returns null when nothing parseable is found.
 */
export function parseDurationMinutes(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const minutes = Number.parseInt(trimmed, 10);
    return minutes > 0 ? minutes : null;
  }
  const pattern = /(\d+)\s*(w|d|h|m)/g;
  let total = 0;
  let matched = false;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(trimmed)) !== null) {
    matched = true;
    const value = Number.parseInt(match[1] ?? '0', 10);
    const unit = match[2];
    const factor = unit === 'w' ? 10_080 : unit === 'd' ? 1_440 : unit === 'h' ? 60 : 1;
    total += value * factor;
  }
  if (!matched || total <= 0) return null;
  return total;
}

/** Text progress bar built from block characters, e.g. `▓▓▓▓░░░░░░░░ 33%`. */
export function progressBar(current: number, total: number, length = 14): string {
  const safeTotal = total > 0 ? total : 1;
  const ratio = Math.min(Math.max(current / safeTotal, 0), 1);
  const filled = Math.round(ratio * length);
  const bar = '▓'.repeat(filled) + '░'.repeat(Math.max(length - filled, 0));
  return `${bar} ${Math.round(ratio * 100)}%`;
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(maxLength - 1, 0))}…`;
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString('hex');
}

export function newId(): string {
  return randomUUID();
}

/** Format a date consistently as UTC for user-facing output. */
export function formatDate(date: Date | null | undefined): string {
  if (!date) return 'Unknown';
  return `${date.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
}

export function mentionUser(userId: string): string {
  return `<@${userId}>`;
}

export function mentionChannel(channelId: string): string {
  return `<#${channelId}>`;
}

export function mentionRole(roleId: string): string {
  return `<@&${roleId}>`;
}

/** Extract all role mention IDs from a string ("<@&123> <@&456>"). */
export function parseRoleMentions(text: string): string[] {
  const ids: string[] = [];
  const pattern = /<@&(\d{15,21})>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    ids.push(match[1] as string);
  }
  return ids;
}

/** Extract all user mention IDs from a string ("<@123>" or "<@!123>"). */
export function parseUserMentions(text: string): string[] {
  const ids: string[] = [];
  const pattern = /<@!?(\d{15,21})>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    ids.push(match[1] as string);
  }
  return ids;
}

/** UTC midnight for the given timestamp — Prisma @db.Date key for analytics. */
export function utcDay(date: Date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Safely convert an arbitrary JS value into a Prisma InputJsonValue. */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

/** Safe JSON.parse returning null instead of throwing. */
export function safeJsonParse<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  try {
    if (typeof raw === 'string') return JSON.parse(raw) as T;
    return raw as T;
  } catch {
    return null;
  }
}

/** Capitalize the first letter of a string. */
export function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function codeBlock(text: string, language = ''): string {
  return `\`\`\`${language}\n${truncate(text, 1900)}\n\`\`\``;
}

/** Pluralize a count ("1 warning" / "3 warnings"). */
export function plural(count: number, singularWord: string, pluralWord = `${singularWord}s`): string {
  return `${count} ${count === 1 ? singularWord : pluralWord}`;
}
