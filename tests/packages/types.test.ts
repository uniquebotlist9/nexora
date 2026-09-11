import { describe, expect, it } from 'vitest';
import {
  isPlanTier,
  isSnowflake,
  isWebhookEvent,
  limitsForPlan,
  PLAN_LIMITS,
  PLAN_TIERS,
  SNOWFLAKE_REGEX,
  WEBHOOK_EVENTS,
  type PlanTier,
} from '../../packages/types/src/index';

describe('plan tiers', () => {
  it('defines the four tiers FREE, PRO, BUSINESS and ENTERPRISE', () => {
    expect(PLAN_TIERS).toEqual(['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE']);
    expect(Object.keys(PLAN_LIMITS)).toEqual(['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE']);
  });

  it('returns the documented FREE limits', () => {
    const free = limitsForPlan('FREE');
    expect(free.automations).toBe(3);
    expect(free.customCommands).toBe(5);
    expect(free.autoModRules).toBe(5);
    expect(free.backups).toBe(1);
    expect(free.giveaways).toBe(3);
    expect(free.reactionRoleMessages).toBe(3);
    expect(free.ticketTypes).toBe(3);
    expect(free.analyticsRetentionDays).toBe(7);
    expect(free.ai).toBe(false);
    expect(free.welcomeCards).toBe(false);
    expect(free.customBranding).toBe(false);
    expect(free.extendedLogs).toBe(false);
    expect(free.apiKeys).toBe(0); // no developer API on FREE
    expect(free.scheduledJobs).toBe(3);
    expect(free.economy).toBe(true);
  });

  it('returns the documented PRO limits', () => {
    const pro = limitsForPlan('PRO');
    expect(pro.automations).toBe(25);
    expect(pro.customCommands).toBe(50);
    expect(pro.autoModRules).toBe(25);
    expect(pro.backups).toBe(10);
    expect(pro.giveaways).toBe(25);
    expect(pro.reactionRoleMessages).toBe(15);
    expect(pro.ticketTypes).toBe(10);
    expect(pro.analyticsRetentionDays).toBe(90);
    expect(pro.ai).toBe(true);
    expect(pro.welcomeCards).toBe(true);
    expect(pro.customBranding).toBe(true);
    expect(pro.extendedLogs).toBe(true);
    expect(pro.apiKeys).toBe(2);
    expect(pro.scheduledJobs).toBe(25);
    expect(pro.economy).toBe(true);
  });

  it('returns the documented BUSINESS limits', () => {
    const business = limitsForPlan('BUSINESS');
    expect(business.automations).toBe(100);
    expect(business.customCommands).toBe(200);
    expect(business.autoModRules).toBe(100);
    expect(business.backups).toBe(50);
    expect(business.giveaways).toBe(100);
    expect(business.reactionRoleMessages).toBe(50);
    expect(business.ticketTypes).toBe(25);
    expect(business.analyticsRetentionDays).toBe(365);
    expect(business.apiKeys).toBe(10);
    expect(business.scheduledJobs).toBe(100);
  });

  it('returns the documented ENTERPRISE limits', () => {
    const enterprise = limitsForPlan('ENTERPRISE');
    expect(enterprise.automations).toBe(1000);
    expect(enterprise.customCommands).toBe(1000);
    expect(enterprise.autoModRules).toBe(1000);
    expect(enterprise.backups).toBe(500);
    expect(enterprise.giveaways).toBe(1000);
    expect(enterprise.reactionRoleMessages).toBe(500);
    expect(enterprise.ticketTypes).toBe(100);
    expect(enterprise.analyticsRetentionDays).toBe(730);
    expect(enterprise.apiKeys).toBe(100);
    expect(enterprise.scheduledJobs).toBe(1000);
    expect(enterprise.ai).toBe(true);
    expect(enterprise.economy).toBe(true);
  });

  it('never decreases count limits as the tier goes up', () => {
    const tiers: PlanTier[] = ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE'];
    const countKeys = [
      'automations',
      'customCommands',
      'autoModRules',
      'backups',
      'giveaways',
      'reactionRoleMessages',
      'ticketTypes',
      'analyticsRetentionDays',
      'apiKeys',
      'scheduledJobs',
    ] as const;
    for (const key of countKeys) {
      for (let i = 1; i < tiers.length; i++) {
        expect(limitsForPlan(tiers[i])[key]).toBeGreaterThanOrEqual(
          limitsForPlan(tiers[i - 1])[key],
        );
      }
    }
  });

  it('falls back to FREE limits for unknown tiers', () => {
    const unknown = 'ULTRA' as PlanTier;
    expect(limitsForPlan(unknown)).toBe(PLAN_LIMITS.FREE);
  });

  it('isPlanTier narrows correctly', () => {
    expect(isPlanTier('FREE')).toBe(true);
    expect(isPlanTier('PRO')).toBe(true);
    expect(isPlanTier('BUSINESS')).toBe(true);
    expect(isPlanTier('ENTERPRISE')).toBe(true);
    expect(isPlanTier('free')).toBe(false); // case sensitive
    expect(isPlanTier('ULTRA')).toBe(false);
    expect(isPlanTier('')).toBe(false);
  });
});

describe('webhook events', () => {
  it('exposes the documented event catalog', () => {
    expect(WEBHOOK_EVENTS).toEqual([
      'member.join',
      'member.leave',
      'message.delete',
      'message.edit',
      'moderation.warn',
      'moderation.timeout',
      'moderation.kick',
      'moderation.ban',
      'moderation.unban',
      'automod.triggered',
      'ticket.created',
      'ticket.closed',
      'giveaway.started',
      'giveaway.ended',
      'level.up',
      'verification.completed',
    ]);
  });

  it('isWebhookEvent accepts every catalog entry', () => {
    for (const event of WEBHOOK_EVENTS) {
      expect(isWebhookEvent(event)).toBe(true);
    }
  });

  it('isWebhookEvent rejects unknown events', () => {
    expect(isWebhookEvent('member.bonk')).toBe(false);
    expect(isWebhookEvent('')).toBe(false);
    expect(isWebhookEvent('MEMBER.JOIN')).toBe(false); // case sensitive
  });
});

describe('snowflakes', () => {
  it('accepts 15-21 digit Discord IDs', () => {
    expect(isSnowflake('123456789012345')).toBe(true); // 15 digits (minimum)
    expect(isSnowflake('123456789012345678')).toBe(true); // typical user ID
    expect(isSnowflake('1'.repeat(21))).toBe(true); // 21 digits (maximum)
  });

  it('rejects too-short, too-long and non-numeric values', () => {
    expect(isSnowflake('12345678901234')).toBe(false); // 14 digits
    expect(isSnowflake('1'.repeat(22))).toBe(false); // 22 digits
    expect(isSnowflake('12345678901234567a')).toBe(false);
    expect(isSnowflake('user-123')).toBe(false);
    expect(isSnowflake('')).toBe(false);
  });

  it('exposes the raw regex for reuse', () => {
    expect(SNOWFLAKE_REGEX.test('123456789012345678')).toBe(true);
    expect(SNOWFLAKE_REGEX.test('nope')).toBe(false);
  });
});
