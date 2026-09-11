import { describe, expect, it } from 'vitest';
import {
  autoModRuleInputSchema,
  automationInputSchema,
  customCommandInputSchema,
  escalationConfigSchema,
  giveawayCreateInputSchema,
  messagePayloadSchema,
  modActionInputSchema,
  paginationSchema,
  ticketConfigInputSchema,
  webhookEndpointInputSchema,
} from '../../packages/validation/src/index';

const SNOWFLAKE = '123456789012345678';

function expectValid<T>(schema: { safeParse: (input: unknown) => { success: boolean; data?: T; error?: { issues: { message: string }[] } } }, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(`Expected input to be valid, got issues: ${result.error?.issues.map((i) => i.message).join(', ')}`);
  }
  return result.data as T;
}

function expectInvalid(schema: { safeParse: (input: unknown) => { success: boolean } }, input: unknown): void {
  const result = schema.safeParse(input);
  expect(result.success).toBe(false);
}

describe('messagePayloadSchema', () => {
  it('accepts content-only payloads', () => {
    const data = expectValid(messagePayloadSchema, { content: 'Hello!' });
    expect(data.content).toBe('Hello!');
    expect(data.embed).toBeUndefined();
  });

  it('accepts embed-only payloads', () => {
    const data = expectValid(messagePayloadSchema, { embed: { title: 'Hi', description: 'Body' } });
    expect(data.embed?.title).toBe('Hi');
  });

  it('accepts content + embed + buttons', () => {
    const data = expectValid(messagePayloadSchema, {
      content: 'Click it',
      embed: { title: 'Panel' },
      buttons: [{ label: 'Open', style: 'LINK', url: 'https://example.com' }],
    });
    expect(data.buttons).toHaveLength(1);
  });

  it('rejects a payload with neither content nor an embed', () => {
    expectInvalid(messagePayloadSchema, {});
    expectInvalid(messagePayloadSchema, { content: '' });
    expectInvalid(messagePayloadSchema, { buttons: [{ label: 'Nope', style: 'PRIMARY' }] });
  });

  it('enforces Discord length limits', () => {
    expectInvalid(messagePayloadSchema, { content: 'x'.repeat(2001) });
    expectValid(messagePayloadSchema, { content: 'x'.repeat(2000) });
  });

  it('allows at most 5 buttons', () => {
    const buttons = Array.from({ length: 5 }, (_, i) => ({ label: `B${i}`, style: 'PRIMARY' as const }));
    expectValid(messagePayloadSchema, { content: 'ok', buttons });
    expectInvalid(messagePayloadSchema, {
      content: 'ok',
      buttons: [...buttons, { label: 'B6', style: 'PRIMARY' }],
    });
  });

  it('rejects invalid button styles and labels', () => {
    expectInvalid(messagePayloadSchema, {
      content: 'ok',
      buttons: [{ label: 'X', style: 'FANCY' }],
    });
    expectInvalid(messagePayloadSchema, {
      content: 'ok',
      buttons: [{ label: '', style: 'PRIMARY' }],
    });
  });
});

describe('autoModRuleInputSchema', () => {
  const validRule = {
    name: 'No invite links',
    type: 'INVITE',
    actions: [{ type: 'DELETE' }, { type: 'WARN', points: 2 }],
  };

  it('accepts a valid rule and applies defaults', () => {
    const data = expectValid(autoModRuleInputSchema, validRule);
    expect(data.enabled).toBe(true);
    expect(data.trigger).toEqual({});
    expect(data.exemptRoleIds).toEqual([]);
    expect(data.exemptChannelIds).toEqual([]);
  });

  it('accepts every documented rule type', () => {
    const types = [
      'SPAM', 'FLOOD', 'DUPLICATE', 'MENTION_SPAM', 'MASS_MENTION', 'EXCESSIVE_CAPS',
      'EXCESSIVE_EMOJI', 'INVITE', 'URL', 'PHISHING', 'BAD_WORDS', 'NSFW', 'RAID',
      'ACCOUNT_AGE', 'ATTACHMENT', 'BOT_ABUSE',
    ];
    for (const type of types) {
      expectValid(autoModRuleInputSchema, { ...validRule, type });
    }
  });

  it('rejects unknown rule types', () => {
    expectInvalid(autoModRuleInputSchema, { ...validRule, type: 'NOT_A_RULE' });
  });

  it('requires between 1 and 5 actions', () => {
    expectInvalid(autoModRuleInputSchema, { ...validRule, actions: [] });
    const sixActions = Array.from({ length: 6 }, (_, i) => ({ type: i === 0 ? 'WARN' : 'DELETE' }));
    expectInvalid(autoModRuleInputSchema, { ...validRule, actions: sixActions });
    expectInvalid(autoModRuleInputSchema, { ...validRule, actions: [{ type: 'NUKE_SERVER' }] });
  });

  it('validates exemption IDs as snowflakes', () => {
    expectValid(autoModRuleInputSchema, {
      ...validRule,
      exemptRoleIds: [SNOWFLAKE],
      exemptChannelIds: [SNOWFLAKE],
    });
    expectInvalid(autoModRuleInputSchema, { ...validRule, exemptRoleIds: ['role-1'] });
    expectInvalid(autoModRuleInputSchema, { ...validRule, exemptChannelIds: ['123'] });
  });

  it('validates trigger thresholds and windows', () => {
    expectValid(autoModRuleInputSchema, {
      ...validRule,
      trigger: { threshold: 5, windowSeconds: 10 },
    });
    expectInvalid(autoModRuleInputSchema, { ...validRule, trigger: { threshold: 0 } });
    expectInvalid(autoModRuleInputSchema, { ...validRule, trigger: { threshold: 1001 } });
    expectInvalid(autoModRuleInputSchema, { ...validRule, trigger: { windowSeconds: 0 } });
    expectInvalid(autoModRuleInputSchema, { ...validRule, trigger: { similarity: 0.05 } });
    expectInvalid(autoModRuleInputSchema, { ...validRule, trigger: { similarity: 1.5 } });
    expectValid(autoModRuleInputSchema, {
      ...validRule,
      trigger: { words: ['scam', 'freenitro'], caseSensitive: true, whitelist: ['discord.gg/nexora'] },
    });
  });
});

describe('automationInputSchema', () => {
  const validAutomation = {
    name: 'Welcome newcomers',
    trigger: { type: 'MEMBER_JOIN', config: {} },
    actions: [
      {
        type: 'SEND_MESSAGE',
        config: { channelId: SNOWFLAKE, message: { content: 'Welcome {user}!' } },
      },
    ],
  };

  it('accepts a valid automation and defaults enabled=true', () => {
    const data = expectValid(automationInputSchema, validAutomation);
    expect(data.enabled).toBe(true);
    expect(data.actions).toHaveLength(1);
  });

  it('accepts every documented trigger type', () => {
    const triggers = [
      'MEMBER_JOIN', 'MEMBER_LEAVE', 'ROLE_ADDED', 'ROLE_REMOVED', 'MESSAGE_SENT',
      'KEYWORD_DETECTED', 'LEVEL_REACHED', 'TICKET_CREATED', 'TICKET_CLOSED',
      'GIVEAWAY_ENDED', 'SCHEDULED', 'MILESTONE',
    ];
    for (const type of triggers) {
      expectValid(automationInputSchema, {
        ...validAutomation,
        trigger: { type, config: {} },
      });
    }
  });

  it('accepts every documented action type', () => {
    const actions = [
      'SEND_MESSAGE', 'SEND_DM', 'ADD_ROLE', 'REMOVE_ROLE', 'TIMEOUT', 'CREATE_CHANNEL',
      'DELETE_CHANNEL', 'LOG_EVENT', 'CREATE_TICKET', 'CHANGE_NICKNAME', 'SEND_WEBHOOK',
    ];
    for (const type of actions) {
      expectValid(automationInputSchema, {
        ...validAutomation,
        actions: [{ type, config: {} }],
      });
    }
  });

  it('rejects unknown trigger and action types', () => {
    expectInvalid(automationInputSchema, {
      ...validAutomation,
      trigger: { type: 'ON_BOOP', config: {} },
    });
    expectInvalid(automationInputSchema, {
      ...validAutomation,
      actions: [{ type: 'DANCE', config: {} }],
    });
  });

  it('validates trigger configs (keywords, roles, schedule, milestone)', () => {
    expectValid(automationInputSchema, {
      ...validAutomation,
      trigger: { type: 'KEYWORD_DETECTED', config: { keywords: ['free nitro'] } },
    });
    expectInvalid(automationInputSchema, {
      ...validAutomation,
      trigger: { type: 'KEYWORD_DETECTED', config: { keywords: [''] } },
    });
    expectValid(automationInputSchema, {
      ...validAutomation,
      trigger: { type: 'SCHEDULED', config: { intervalMinutes: 15 } },
    });
    expectInvalid(automationInputSchema, {
      ...validAutomation,
      trigger: { type: 'SCHEDULED', config: { intervalMinutes: 0 } },
    });
    expectValid(automationInputSchema, {
      ...validAutomation,
      trigger: { type: 'LEVEL_REACHED', config: { level: 10 } },
    });
    expectInvalid(automationInputSchema, {
      ...validAutomation,
      trigger: { type: 'LEVEL_REACHED', config: { level: 0 } },
    });
    expectValid(automationInputSchema, {
      ...validAutomation,
      trigger: { type: 'MILESTONE', config: { memberCount: 1000 } },
    });
  });

  it('requires the action message to be a valid message payload', () => {
    expectInvalid(automationInputSchema, {
      ...validAutomation,
      actions: [{ type: 'SEND_MESSAGE', config: { channelId: SNOWFLAKE, message: {} } }],
    });
  });

  it('allows between 1 and 10 actions', () => {
    const action = { type: 'LOG_EVENT', config: {} };
    expectInvalid(automationInputSchema, { ...validAutomation, actions: [] });
    expectValid(automationInputSchema, {
      ...validAutomation,
      actions: Array.from({ length: 10 }, () => action),
    });
    expectInvalid(automationInputSchema, {
      ...validAutomation,
      actions: Array.from({ length: 11 }, () => action),
    });
  });
});

describe('giveawayCreateInputSchema', () => {
  const validGiveaway = {
    channelId: SNOWFLAKE,
    prize: 'Discord Nitro',
    winnerCount: 3,
    durationMinutes: 1440, // 1 day
  };

  it('accepts a valid giveaway', () => {
    const data = expectValid(giveawayCreateInputSchema, validGiveaway);
    expect(data.prize).toBe('Discord Nitro');
  });

  it('accepts entry requirements and bonus roles', () => {
    expectValid(giveawayCreateInputSchema, {
      ...validGiveaway,
      requiredRoleId: SNOWFLAKE,
      minAccountAgeDays: 7,
      minMembershipDays: 30,
      minMessages: 50,
      bonusRoles: [{ roleId: SNOWFLAKE, extraEntries: 5 }],
    });
  });

  it('bounds winnerCount to 1..50', () => {
    expectInvalid(giveawayCreateInputSchema, { ...validGiveaway, winnerCount: 0 });
    expectInvalid(giveawayCreateInputSchema, { ...validGiveaway, winnerCount: 51 });
    expectValid(giveawayCreateInputSchema, { ...validGiveaway, winnerCount: 50 });
  });

  it('bounds duration to at most 30 days', () => {
    expectInvalid(giveawayCreateInputSchema, { ...validGiveaway, durationMinutes: 0 });
    expectValid(giveawayCreateInputSchema, { ...validGiveaway, durationMinutes: 60 * 24 * 30 });
    expectInvalid(giveawayCreateInputSchema, { ...validGiveaway, durationMinutes: 60 * 24 * 30 + 1 });
  });

  it('allows at most 10 bonus roles', () => {
    const eleven = Array.from({ length: 11 }, () => ({ roleId: SNOWFLAKE, extraEntries: 2 }));
    expectInvalid(giveawayCreateInputSchema, { ...validGiveaway, bonusRoles: eleven });
  });

  it('requires a channel snowflake and a non-empty prize', () => {
    expectInvalid(giveawayCreateInputSchema, { ...validGiveaway, channelId: 'general' });
    expectInvalid(giveawayCreateInputSchema, { ...validGiveaway, prize: '' });
  });
});

describe('customCommandInputSchema', () => {
  const validCommand = {
    name: 'rules',
    description: 'Show the server rules',
    response: { content: 'Be nice.' },
  };

  it('accepts a valid custom command and applies defaults', () => {
    const data = expectValid(customCommandInputSchema, validCommand);
    expect(data.cooldownSeconds).toBe(3);
    expect(data.requiredRoleIds).toEqual([]);
    expect(data.enabled).toBe(true);
  });

  it('only allows lowercase letters, numbers and dashes in the name', () => {
    expectValid(customCommandInputSchema, { ...validCommand, name: 'welcome-msg' });
    expectValid(customCommandInputSchema, { ...validCommand, name: '8ball' });
    expectValid(customCommandInputSchema, { ...validCommand, name: 'a'.repeat(32) });
    expectInvalid(customCommandInputSchema, { ...validCommand, name: 'Rules' });
    expectInvalid(customCommandInputSchema, { ...validCommand, name: 'rule_list' });
    expectInvalid(customCommandInputSchema, { ...validCommand, name: 'rule!' });
    expectInvalid(customCommandInputSchema, { ...validCommand, name: 'with space' });
    expectInvalid(customCommandInputSchema, { ...validCommand, name: '' });
    expectInvalid(customCommandInputSchema, { ...validCommand, name: 'a'.repeat(33) });
  });

  it('requires a valid message payload as the response', () => {
    expectInvalid(customCommandInputSchema, { ...validCommand, response: {} });
    expectValid(customCommandInputSchema, {
      ...validCommand,
      response: { embed: { title: 'Rules', description: 'Be nice.' } },
    });
  });

  it('bounds the cooldown to 0..3600 seconds', () => {
    expectValid(customCommandInputSchema, { ...validCommand, cooldownSeconds: 0 });
    expectValid(customCommandInputSchema, { ...validCommand, cooldownSeconds: 3600 });
    expectInvalid(customCommandInputSchema, { ...validCommand, cooldownSeconds: 3601 });
    expectInvalid(customCommandInputSchema, { ...validCommand, cooldownSeconds: -1 });
  });
});

describe('escalationConfigSchema', () => {
  const validConfig = {
    steps: [
      { warnings: 2, action: 'timeout', durationMinutes: 60 },
      { warnings: 4, action: 'kick' },
    ],
    resetOnEscalate: true,
  };

  it('accepts a valid escalation ladder', () => {
    const data = expectValid(escalationConfigSchema, validConfig);
    expect(data.steps).toHaveLength(2);
    expect(data.resetOnEscalate).toBe(true);
  });

  it('defaults steps to [] and resetOnEscalate to true', () => {
    const data = expectValid(escalationConfigSchema, {});
    expect(data.steps).toEqual([]);
    expect(data.resetOnEscalate).toBe(true);
  });

  it('only allows timeout/kick/tempban/ban actions', () => {
    expectInvalid(escalationConfigSchema, {
      steps: [{ warnings: 2, action: 'mute' }],
    });
  });

  it('bounds warnings to 1..100 and steps to at most 10', () => {
    expectInvalid(escalationConfigSchema, { steps: [{ warnings: 0, action: 'kick' }] });
    expectInvalid(escalationConfigSchema, { steps: [{ warnings: 101, action: 'kick' }] });
    const eleven = Array.from({ length: 11 }, (_, i) => ({ warnings: i + 1, action: 'kick' }));
    expectInvalid(escalationConfigSchema, { steps: eleven });
  });

  it('bounds durationMinutes to at most one year', () => {
    expectInvalid(escalationConfigSchema, {
      steps: [{ warnings: 2, action: 'tempban', durationMinutes: 60 * 24 * 365 + 1 }],
    });
    expectValid(escalationConfigSchema, {
      steps: [{ warnings: 2, action: 'tempban', durationMinutes: 60 * 24 * 365 }],
    });
  });
});

describe('modActionInputSchema', () => {
  it('accepts a valid moderation action with defaults', () => {
    const data = expectValid(modActionInputSchema, { targetId: SNOWFLAKE });
    expect(data.reason).toBe('No reason provided');
    expect(data.notifyUser).toBe(true);
  });

  it('validates the target as a snowflake', () => {
    expectInvalid(modActionInputSchema, { targetId: 'someone' });
    expectInvalid(modActionInputSchema, { targetId: '123' });
  });

  it('bounds reason, duration and evidence', () => {
    expectInvalid(modActionInputSchema, { targetId: SNOWFLAKE, reason: '' });
    expectInvalid(modActionInputSchema, { targetId: SNOWFLAKE, reason: 'x'.repeat(1001) });
    expectInvalid(modActionInputSchema, { targetId: SNOWFLAKE, durationMinutes: 0 });
    expectInvalid(modActionInputSchema, {
      targetId: SNOWFLAKE,
      evidence: Array.from({ length: 6 }, () => 'https://example.com/1.png'),
    });
    expectValid(modActionInputSchema, {
      targetId: SNOWFLAKE,
      durationMinutes: 60,
      evidence: ['https://example.com/1.png'],
    });
  });
});

describe('ticketConfigInputSchema', () => {
  it('applies documented defaults', () => {
    const data = expectValid(ticketConfigInputSchema, {});
    expect(data.enabled).toBe(false);
    expect(data.inactivityHours).toBe(48);
    expect(data.claimRequired).toBe(false);
    expect(data.types).toEqual([]);
    expect(data.staffRoleIds).toEqual([]);
    expect(data.blacklist).toEqual([]);
  });

  it('accepts ticket types with priorities', () => {
    const data = expectValid(ticketConfigInputSchema, {
      enabled: true,
      channelId: SNOWFLAKE,
      types: [{ id: 'support', name: 'Support', priority: 'HIGH' }],
    });
    expect(data.types[0]?.priority).toBe('HIGH');
    expect(data.types[0]?.description).toBe('');
  });

  it('bounds inactivity hours to 1..720', () => {
    expectInvalid(ticketConfigInputSchema, { inactivityHours: 0 });
    expectInvalid(ticketConfigInputSchema, { inactivityHours: 721 });
    expectValid(ticketConfigInputSchema, { inactivityHours: 720 });
  });

  it('validates blacklist entries as snowflakes', () => {
    expectInvalid(ticketConfigInputSchema, { blacklist: ['bad-actor'] });
    expectValid(ticketConfigInputSchema, { blacklist: [SNOWFLAKE] });
  });
});

describe('webhookEndpointInputSchema', () => {
  it('accepts a valid endpoint', () => {
    const data = expectValid(webhookEndpointInputSchema, {
      name: 'Community events',
      url: 'https://example.com/hooks/nexora',
      events: ['member.join', 'moderation.warn'],
    });
    expect(data.events).toHaveLength(2);
  });

  it('requires a URL and at least one event', () => {
    expectInvalid(webhookEndpointInputSchema, { name: 'X', url: 'not-a-url', events: ['member.join'] });
    expectInvalid(webhookEndpointInputSchema, { name: 'X', url: 'https://example.com/h', events: [] });
    expectInvalid(webhookEndpointInputSchema, { name: '', url: 'https://example.com/h', events: ['member.join'] });
  });

  it('allows at most 50 events', () => {
    const events = Array.from({ length: 51 }, () => 'member.join');
    expectInvalid(webhookEndpointInputSchema, {
      name: 'X',
      url: 'https://example.com/h',
      events,
    });
  });
});

describe('paginationSchema', () => {
  it('defaults to page 1 / pageSize 25', () => {
    const data = expectValid(paginationSchema, {});
    expect(data).toEqual({ page: 1, pageSize: 25 });
  });

  it('coerces numeric strings (query params)', () => {
    const data = expectValid(paginationSchema, { page: '3', pageSize: '50' });
    expect(data).toEqual({ page: 3, pageSize: 50 });
  });

  it('bounds page >= 1 and pageSize <= 100', () => {
    expectInvalid(paginationSchema, { page: 0 });
    expectInvalid(paginationSchema, { page: 'abc' });
    expectInvalid(paginationSchema, { pageSize: 101 });
    expectInvalid(paginationSchema, { pageSize: 0 });
    expectValid(paginationSchema, { page: 1, pageSize: 100 });
  });
});
