/**
 * Template variable engine for user-configurable messages
 * (welcome, farewell, level-up, custom commands, automations, tickets).
 *
 * Supported variables:
 *   {user} {username} {userid} {server} {membercount} {channel}
 *   {createdAt} {level} {xp} {ticket} {reason} {count} {prize}
 */
const TEMPLATE_PATTERN = /\{(\w+)\}/g;

export interface TemplateContext {
  user?: string;
  username?: string;
  userid?: string;
  server?: string;
  membercount?: number | string;
  channel?: string;
  createdAt?: string;
  level?: number | string;
  xp?: number | string;
  ticket?: number | string;
  reason?: string;
  count?: number | string;
  prize?: string;
  [key: string]: string | number | undefined;
}

export function parseTemplate(template: string, context: TemplateContext): string {
  return template.replace(TEMPLATE_PATTERN, (match, key: string) => {
    const value = context[key];
    if (value === undefined || value === null) return match;
    return String(value);
  });
}

export function availableVariables(): string[] {
  return [
    '{user}', '{username}', '{userid}', '{server}', '{membercount}',
    '{channel}', '{createdAt}', '{level}', '{xp}', '{ticket}',
    '{reason}', '{count}', '{prize}',
  ];
}

/** Escape user-provided text before inserting it into markdown-ish output. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|>~]/g, (c) => `\\${c}`);
}

export function chunk(text: string, maxLength: number): string[] {
  if (maxLength < 1) throw new Error('maxLength must be positive');
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    // Prefer splitting on a newline or space near the boundary.
    let splitAt = remaining.lastIndexOf('\n', maxLength);
    if (splitAt <= 0) splitAt = remaining.lastIndexOf(' ', maxLength);
    if (splitAt <= 0) splitAt = maxLength;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\s+/, '');
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}
