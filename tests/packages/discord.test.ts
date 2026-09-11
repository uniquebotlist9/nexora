import { describe, expect, it } from 'vitest';
import {
  availableVariables,
  buildEmbed,
  chunk,
  escapeMarkdown,
  formatDuration,
  parseTemplate,
  snowflakeToDate,
  toMessageOptions,
} from '../../packages/discord/src/index';

describe('parseTemplate', () => {
  it('substitutes known variables', () => {
    const context = {
      user: '<@123456789012345678>',
      username: 'victus',
      server: 'Nexora Community',
      membercount: 1337,
    };
    expect(parseTemplate('Welcome {user} to {server}!', context)).toBe(
      'Welcome <@123456789012345678> to Nexora Community!',
    );
    expect(parseTemplate('{username} • {membercount} members', context)).toBe('victus • 1337 members');
  });

  it('passes unknown variables through unchanged', () => {
    expect(parseTemplate('Hello {nope} {user}!', { user: 'bob' })).toBe('Hello {nope} bob!');
    expect(parseTemplate('{completely_unknown}', {})).toBe('{completely_unknown}');
  });

  it('passes variables through when the context value is undefined or null', () => {
    expect(parseTemplate('Level {level}', { level: undefined })).toBe('Level {level}');
    // null is treated as "not provided" rather than stringified
    const ctx = { user: null } as unknown as Parameters<typeof parseTemplate>[1];
    expect(parseTemplate('Hi {user}', ctx)).toBe('Hi {user}');
  });

  it('stringifies numeric values', () => {
    expect(parseTemplate('Level {level} ({xp} XP)', { level: 12, xp: 4500 })).toBe('Level 12 (4500 XP)');
  });

  it('replaces every occurrence of a variable', () => {
    expect(parseTemplate('{user} and {user}', { user: 'bob' })).toBe('bob and bob');
  });

  it('supports every advertised variable', () => {
    const vars = availableVariables();
    expect(vars).toHaveLength(13);
    for (const v of vars) expect(v).toMatch(/^\{\w+\}$/);

    const context = {
      user: '<@1>',
      username: 'name',
      userid: '1',
      server: 'srv',
      membercount: 10,
      channel: 'general',
      createdAt: '2026-01-01',
      level: 5,
      xp: 100,
      ticket: 7,
      reason: 'spam',
      count: 3,
      prize: 'Nitro',
    };
    const template = vars.join(' | ');
    const result = parseTemplate(template, context);
    // Every placeholder was substituted — no braces remain.
    expect(result).not.toMatch(/\{\w+\}/);
    expect(result).toContain('<@1> | name | 1 | srv | 10 | general | 2026-01-01 | 5 | 100 | 7 | spam | 3 | Nitro');
  });
});

describe('escapeMarkdown', () => {
  it('escapes markdown-significant characters', () => {
    expect(escapeMarkdown('**bold**')).toBe('\\*\\*bold\\*\\*');
    expect(escapeMarkdown('`code`')).toBe('\\`code\\`');
    expect(escapeMarkdown('# heading')).toBe('\\# heading');
  });
});

describe('chunk', () => {
  it('returns the text as a single chunk when it fits', () => {
    expect(chunk('hello', 10)).toEqual(['hello']);
    expect(chunk('exact', 5)).toEqual(['exact']);
    expect(chunk('', 5)).toEqual(['']);
  });

  it('throws for a non-positive max length', () => {
    expect(() => chunk('x', 0)).toThrow(/maxLength must be positive/);
    expect(() => chunk('x', -1)).toThrow(/maxLength must be positive/);
  });

  it('hard-splits text with no separators', () => {
    expect(chunk('abcdef', 3)).toEqual(['abc', 'def']);
    expect(chunk('abcdefg', 3)).toEqual(['abc', 'def', 'g']);
  });

  it('prefers splitting on newlines near the boundary', () => {
    expect(chunk('a\nbcd', 3)).toEqual(['a', 'bcd']);
    expect(chunk('line1\nline2\nline3', 5)).toEqual(['line1', 'line2', 'line3']);
  });

  it('prefers splitting on spaces when there is no newline', () => {
    expect(chunk('a b c', 2)).toEqual(['a', 'b', 'c']);
    expect(chunk('aa bbbb cc', 3)).toEqual(['aa', 'bbb', 'b', 'cc']);
  });

  it('never produces empty chunks and loses no characters except boundary whitespace', () => {
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(5);
    const chunks = chunk(text, 20);
    for (const part of chunks) {
      expect(part.length).toBeLessThanOrEqual(20);
      expect(part.length).toBeGreaterThan(0);
    }
    // Whitespace between chunks may be trimmed, but all words survive in order.
    const words = chunks.join(' ').split(/\s+/).filter(Boolean);
    const expectedWords = text.split(/\s+/).filter(Boolean);
    expect(words).toEqual(expectedWords);
  });
});

describe('formatDuration', () => {
  it('formats zero and negative durations as "0s"', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(-5000)).toBe('0s');
    expect(formatDuration(999)).toBe('0s'); // sub-second floors to 0
  });

  it('formats seconds, minutes, hours and days', () => {
    expect(formatDuration(1000)).toBe('1s');
    expect(formatDuration(59_000)).toBe('59s');
    expect(formatDuration(60_000)).toBe('1m');
    expect(formatDuration(90_000)).toBe('1m 30s');
    expect(formatDuration(3_600_000)).toBe('1h');
    expect(formatDuration(86_400_000)).toBe('1d');
  });

  it('includes seconds only when there are no days or hours', () => {
    expect(formatDuration(61_000)).toBe('1m 1s');
    expect(formatDuration(3_661_000)).toBe('1h 1m'); // seconds dropped once hours appear
    expect(formatDuration(90_061_000)).toBe('1d 1h 1m');
  });

  it('formats a 7-day timeout the way moderation output expects', () => {
    expect(formatDuration(7 * 24 * 60 * 60_000)).toBe('7d');
    expect(formatDuration(30 * 24 * 60 * 60_000)).toBe('30d');
  });
});

describe('snowflakeToDate', () => {
  it('uses the Discord epoch (2015-01-01T00:00:00Z)', () => {
    expect(snowflakeToDate('0').toISOString()).toBe('2015-01-01T00:00:00.000Z');
    expect(snowflakeToDate((2n ** 22n).toString()).toISOString()).toBe('2015-01-01T00:00:00.001Z');
  });

  it('is monotonic: larger snowflakes never map to earlier dates', () => {
    let previous = snowflakeToDate('1000000000000000000').getTime();
    for (let i = 1; i <= 50; i++) {
      const id = (10n ** 18n + BigInt(i) * 12345n).toString();
      const current = snowflakeToDate(id).getTime();
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it('produces plausible real-world timestamps', () => {
    const date = snowflakeToDate('1300000000000000000'); // ~mid-2024 snowflake range
    expect(date.getUTCFullYear()).toBeGreaterThanOrEqual(2024);
    expect(date.getUTCFullYear()).toBeLessThanOrEqual(2025);
  });
});

describe('buildEmbed', () => {
  it('returns null for null/undefined input', () => {
    expect(buildEmbed(null)).toBeNull();
    expect(buildEmbed(undefined)).toBeNull();
  });

  it('builds an embed from shared EmbedData', () => {
    const embed = buildEmbed({
      title: 'Giveaway',
      description: 'Win Nitro',
      color: 0x5865f2,
      fields: [{ name: 'Ends', value: 'tomorrow', inline: true }],
    });
    const json = embed?.toJSON();
    expect(json?.title).toBe('Giveaway');
    expect(json?.description).toBe('Win Nitro');
    expect(json?.color).toBe(0x5865f2);
    expect(json?.fields).toHaveLength(1);
  });

  it('clamps fields to Discord’s limit of 25', () => {
    const fields = Array.from({ length: 30 }, (_, i) => ({ name: `F${i}`, value: 'v' }));
    const embed = buildEmbed({ title: 'Many fields', fields });
    expect(embed?.toJSON().fields).toHaveLength(25);
  });

  it('clamps title, description and footer to Discord’s limits', () => {
    const embed = buildEmbed({
      title: 't'.repeat(300),
      description: 'd'.repeat(5000),
      footer: { text: 'f'.repeat(3000) },
    });
    const json = embed?.toJSON();
    expect(json?.title).toHaveLength(256);
    expect(json?.description).toHaveLength(4096);
    expect(json?.footer?.text).toHaveLength(2048);
  });

  it('sets the timestamp when requested', () => {
    const json = buildEmbed({ description: 'hi', timestamp: true })?.toJSON();
    expect(json?.timestamp).toBeDefined();
  });

  it('maps author, image, thumbnail and url', () => {
    const json = buildEmbed({
      description: 'rich',
      url: 'https://example.com/post',
      author: { name: 'Nexora', iconUrl: 'https://example.com/icon.png' },
      image: 'https://example.com/banner.png',
      thumbnail: 'https://example.com/thumb.png',
    })?.toJSON();
    expect(json?.author?.name).toBe('Nexora');
    expect(json?.image?.url).toBe('https://example.com/banner.png');
    expect(json?.thumbnail?.url).toBe('https://example.com/thumb.png');
    expect(json?.url).toBe('https://example.com/post');
  });
});

describe('toMessageOptions', () => {
  it('renders template variables in content', () => {
    const options = toMessageOptions({ content: 'Welcome {user} to {server}!' }, {
      user: '<@123456789012345678>',
      server: 'Nexora',
    });
    expect(options.content).toBe('Welcome <@123456789012345678> to Nexora!');
    expect(options.embeds).toBeUndefined();
    expect(options.components).toBeUndefined();
  });

  it('renders template variables in embed title and description', () => {
    const options = toMessageOptions(
      {
        embed: {
          title: 'Goodbye {username}',
          description: '{username} left {server}. We now have {membercount} members.',
        },
      },
      { username: 'victus', server: 'Nexora', membercount: 42 },
    );
    const embed = (options.embeds as { toJSON: () => { title?: string; description?: string } }[])[0].toJSON();
    expect(embed.title).toBe('Goodbye victus');
    expect(embed.description).toBe('victus left Nexora. We now have 42 members.');
  });

  it('truncates rendered content to 2000 characters', () => {
    const options = toMessageOptions(
      { content: 'x'.repeat(1990) + '{user}' },
      { user: 'y'.repeat(50) },
    );
    expect(options.content).toHaveLength(2000);
  });

  it('clamps buttons to 5 and maps styles', () => {
    const buttons = Array.from({ length: 7 }, (_, i) => ({
      label: `B${i}`,
      style: 'PRIMARY' as const,
    }));
    const options = toMessageOptions({ content: 'panel', buttons });
    const row = options.components?.[0] as unknown as { components: unknown[] };
    expect(row.components).toHaveLength(5);
  });

  it('adds a URL to LINK buttons', () => {
    const options = toMessageOptions(
      { content: 'docs', buttons: [{ label: 'Open docs', style: 'LINK', url: 'https://example.com' }] },
      {},
    );
    expect(options.components).toBeDefined();
  });
});
