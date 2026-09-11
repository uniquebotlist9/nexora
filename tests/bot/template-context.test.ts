import { describe, expect, it } from 'vitest';
import {
  availableVariables,
  parseTemplate,
  toMessageOptions,
  type TemplateContext,
} from '../../packages/discord/src/index';

/**
 * Template context building — pure logic, no Discord connection required.
 * These tests pin how the bot builds TemplateContext values for events
 * (member join/leave, level up, moderation, tickets, giveaways) and how
 * parseTemplate renders them into user-configurable messages.
 */

describe('member join context (welcome/farewell messages)', () => {
  it('builds a context that renders the default welcome template', () => {
    const context: TemplateContext = {
      user: '<@123456789012345678>',
      username: 'newcomer',
      userid: '123456789012345678',
      server: 'Nexora Community',
      membercount: 1500,
    };
    const template = 'Welcome {user} to **{server}**! You are member #{membercount}.';
    expect(parseTemplate(template, context)).toBe(
      'Welcome <@123456789012345678> to **Nexora Community**! You are member #1500.',
    );
  });

  it('renders the default level-up announce template from the schema', () => {
    // LevelConfig.announceTemplate default: "GG {user}, you reached level {level}!"
    const context: TemplateContext = { user: '<@42>', level: 7 };
    expect(parseTemplate('GG {user}, you reached level {level}!', context)).toBe(
      'GG <@42>, you reached level 7!',
    );
  });

  it('renders farewell messages with the same context keys', () => {
    const context: TemplateContext = { user: '<@99>', username: 'leaver', membercount: 42 };
    expect(parseTemplate('{username} left. {membercount} members remain.', context)).toBe(
      'leaver left. 42 members remain.',
    );
  });
});

describe('event-specific contexts', () => {
  it('renders moderation contexts (reason, count)', () => {
    const context: TemplateContext = { user: '<@7>', reason: 'Spamming invites', count: 3 };
    expect(
      parseTemplate('{user} was warned for: {reason} (warning #{count})', context),
    ).toBe('<@7> was warned for: Spamming invites (warning #3)');
  });

  it('renders ticket contexts (ticket number)', () => {
    const context: TemplateContext = { user: '<@7>', ticket: 128, channel: 'ticket-128' };
    expect(parseTemplate('Ticket #{ticket} opened by {user} in {channel}.', context)).toBe(
      'Ticket #128 opened by <@7> in ticket-128.',
    );
  });

  it('renders giveaway contexts (prize, count)', () => {
    const context: TemplateContext = { prize: 'Discord Nitro', count: 3 };
    expect(
      parseTemplate('🎉 {count} winners were drawn for {prize}!', context),
    ).toBe('🎉 3 winners were drawn for Discord Nitro!');
  });

  it('renders XP contexts (level, xp)', () => {
    const context: TemplateContext = { user: '<@7>', level: 12, xp: 14600 };
    expect(parseTemplate('{user} → level {level} ({xp} XP)', context)).toBe(
      '<@7> → level 12 (14600 XP)',
    );
  });

  it('leaves unknown placeholders untouched instead of rendering "undefined"', () => {
    // A misconfigured template referencing a variable the event does not
    // provide must degrade gracefully, not print "undefined".
    const result = parseTemplate('Hi {user}, you are member #{membercount}', { user: '<@1>' });
    expect(result).toBe('Hi <@1>, you are member #{membercount}');
    expect(result).not.toContain('undefined');
  });
});

describe('context completeness', () => {
  it('every advertised variable is renderable when provided', () => {
    const context: TemplateContext = {
      user: '<@1>',
      username: 'u',
      userid: '1',
      server: 's',
      membercount: 2,
      channel: 'c',
      createdAt: '2026-09-10',
      level: 1,
      xp: 2,
      ticket: 3,
      reason: 'r',
      count: 4,
      prize: 'p',
    };
    for (const variable of availableVariables()) {
      const rendered = parseTemplate(variable, context);
      expect(rendered).not.toMatch(/[{}]/);
    }
  });
});

describe('message payload rendering with contexts', () => {
  it('renders a full welcome payload (content + embed) through toMessageOptions', () => {
    const context: TemplateContext = {
      user: '<@123456789012345678>',
      username: 'newcomer',
      server: 'Nexora',
      membercount: 100,
    };
    const options = toMessageOptions(
      {
        content: 'Hey {username}!',
        embed: {
          title: 'Welcome to {server}',
          description: '{user} is member #{membercount}.',
          color: 0x5865f2,
        },
      },
      context,
    );
    expect(options.content).toBe('Hey newcomer!');
    const embed = (
      options.embeds as { toJSON: () => { title?: string; description?: string } }[]
    )[0].toJSON();
    expect(embed.title).toBe('Welcome to Nexora');
    expect(embed.description).toBe('<@123456789012345678> is member #100.');
  });

  it('keeps rendered payloads within Discord limits', () => {
    const context: TemplateContext = { user: '<@1>', server: 'S'.repeat(500) };
    const options = toMessageOptions(
      { content: `${'x'.repeat(1900)} {user} {server}`, embed: { description: 'y'.repeat(4000) + ' {server}' } },
      context,
    );
    expect((options.content ?? '').length).toBeLessThanOrEqual(2000);
    const embed = (options.embeds as { toJSON: () => { description?: string } }[])[0].toJSON();
    expect((embed.description ?? '').length).toBeLessThanOrEqual(4096);
  });
});
