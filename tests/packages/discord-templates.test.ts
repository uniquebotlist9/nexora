import { describe, expect, it } from 'vitest';
import {
  availableVariables,
  chunk,
  escapeMarkdown,
  parseTemplate,
} from '../../packages/discord/src/template';

/**
 * Template-engine unit tests, kept separate from discord.test.ts (which covers
 * embeds, durations and snowflakes). These pin the template CONTRACT that
 * every user-configurable message surface (welcome, farewell, level-up,
 * custom commands, automations, tickets) relies on.
 */
describe('parseTemplate (template engine contract)', () => {
  it('substitutes every documented variable', () => {
    const context = {
      user: '<@111111111111111111>',
      username: 'victus',
      userid: '111111111111111111',
      server: 'Nexora Community',
      membercount: 42,
      channel: 'general',
      createdAt: '2026-09-10',
      level: 9,
      xp: 1200,
      ticket: 7,
      reason: 'spam',
      count: 3,
      prize: '1 month of Nitro',
    };
    expect(parseTemplate('Welcome {user} ({username}) to {server}!', context)).toBe(
      'Welcome <@111111111111111111> (victus) to Nexora Community!',
    );
    expect(parseTemplate('Level {level} • {xp} XP', context)).toBe('Level 9 • 1200 XP');
    expect(parseTemplate('Ticket #{ticket}: {reason}', context)).toBe('Ticket #7: spam');
    expect(parseTemplate('{count} winners of {prize}', context)).toBe(
      '3 winners of 1 month of Nitro',
    );
    expect(parseTemplate('{channel} since {createdAt}', context)).toBe('general since 2026-09-10');
  });

  it('passes unknown variables through unchanged (no crash, no blank)', () => {
    expect(parseTemplate('Hello {unknownvar}', {})).toBe('Hello {unknownvar}');
    expect(parseTemplate('{user} and {totally_new}', { user: 'bob' })).toBe('bob and {totally_new}');
    expect(parseTemplate('{USER}', { user: 'bob' })).toBe('{USER}'); // case sensitive
  });

  it('passes variables through when the context value is undefined or null', () => {
    expect(parseTemplate('{level}', {})).toBe('{level}');
    expect(parseTemplate('{level}', { level: undefined })).toBe('{level}');
    const ctx = { prize: null } as unknown as Parameters<typeof parseTemplate>[1];
    expect(parseTemplate('Won {prize}', ctx)).toBe('Won {prize}');
  });

  it('stringifies numbers and leaves no braces for known values', () => {
    const out = parseTemplate('{membercount} members', { membercount: 1337 });
    expect(out).toBe('1337 members');
    expect(out).not.toMatch(/[{}]/);
  });
});

describe('availableVariables', () => {
  it('lists exactly the 13 documented variables', () => {
    const vars = availableVariables();
    expect(vars).toEqual([
      '{user}',
      '{username}',
      '{userid}',
      '{server}',
      '{membercount}',
      '{channel}',
      '{createdAt}',
      '{level}',
      '{xp}',
      '{ticket}',
      '{reason}',
      '{count}',
      '{prize}',
    ]);
  });
});

describe('escapeMarkdown', () => {
  it('escapes every markdown-significant character', () => {
    // One character per special class: code, bold/italic, strike, spoiler,
    // heading, list, quote, link, underline, escaped backslash.
    expect(escapeMarkdown('`')).toBe('\\`');
    expect(escapeMarkdown('*')).toBe('\\*');
    expect(escapeMarkdown('_')).toBe('\\_');
    expect(escapeMarkdown('~')).toBe('\\~');
    expect(escapeMarkdown('#')).toBe('\\#');
    expect(escapeMarkdown('-')).toBe('\\-');
    expect(escapeMarkdown('>')).toBe('\\>');
    expect(escapeMarkdown('[')).toBe('\\[');
    expect(escapeMarkdown('|')).toBe('\\|');
    expect(escapeMarkdown('\\')).toBe('\\\\');
  });

  it('leaves plain text untouched', () => {
    expect(escapeMarkdown('hello world 123')).toBe('hello world 123');
  });

  it('neutralizes formatting in user-provided input', () => {
    // Dots are escaped too (they matter in markdown links), so URLs come out
    // fully escaped — annoying for display, but safe against formatting abuse.
    expect(escapeMarkdown('@everyone **free nitro** https://sc.am')).toBe(
      '@everyone \\*\\*free nitro\\*\\* https://sc\\.am',
    );
  });
});

describe('chunk (message splitting)', () => {
  it('returns a single chunk when the text fits', () => {
    expect(chunk('short', 2000)).toEqual(['short']);
    expect(chunk('', 2000)).toEqual(['']);
    expect(chunk('x'.repeat(2000), 2000)).toEqual(['x'.repeat(2000)]);
  });

  it('splits at whitespace/newline boundaries near the limit', () => {
    const text = 'word '.repeat(1000).trim(); // 5000 chars
    const chunks = chunk(text, 2000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const part of chunks) {
      expect(part.length).toBeLessThanOrEqual(2000);
      expect(part.length).toBeGreaterThan(0);
    }
    // No words lost (only boundary whitespace may be trimmed).
    expect(chunks.join(' ').split(/\s+/).filter(Boolean)).toEqual(
      text.split(/\s+/).filter(Boolean),
    );
  });

  it('hard-splits unbroken strings with no separators', () => {
    expect(chunk('a'.repeat(5000), 2000)).toEqual([
      'a'.repeat(2000),
      'a'.repeat(2000),
      'a'.repeat(1000),
    ]);
  });

  it('never returns an empty trailing chunk', () => {
    for (const len of [2001, 4000, 4001, 6000]) {
      const chunks = chunk('w '.repeat(len).trim(), 2000);
      for (const part of chunks) expect(part.length).toBeGreaterThan(0);
    }
  });

  it('throws for a non-positive max length', () => {
    expect(() => chunk('x', 0)).toThrow(/maxLength must be positive/);
    expect(() => chunk('x', -5)).toThrow(/maxLength must be positive/);
  });
});
