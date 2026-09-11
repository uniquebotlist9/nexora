import { describe, expect, it } from 'vitest';
import {
  ADMIN_ROLES,
  ADMIN_ROLE_RANK,
  AUTO_MOD_ACTION_TYPES,
  AUTO_MOD_RULE_TYPES,
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_TRIGGER_TYPES,
  CASE_TYPES,
  DB_ENUMS,
  GIVEAWAY_STATUSES,
  isAdminRole,
  isAutoModActionType,
  isAutomationActionType,
  isAutomationTriggerType,
  isCaseType,
  isGiveawayStatus,
  isTicketStatus,
  isWebhookDeliveryStatus,
  SUBSCRIPTION_STATUSES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  WEBHOOK_DELIVERY_STATUSES,
} from '../../packages/types/src/db-enums';

/**
 * The Prisma MongoDB connector has no native enums — these const arrays are
 * the single source of truth for every enum-shaped string column in the
 * database. These tests pin their contents so a stray edit cannot silently
 * corrupt existing rows.
 */
describe('DB_ENUMS completeness', () => {
  it('CASE_TYPES has exactly the 13 documented case types', () => {
    expect(CASE_TYPES).toHaveLength(13);
    expect([...CASE_TYPES]).toEqual([
      'WARN',
      'TIMEOUT',
      'KICK',
      'BAN',
      'TEMPBAN',
      'SOFTBAN',
      'MUTE',
      'UNMUTE',
      'UNBAN',
      'NOTE',
      'LOCKDOWN',
      'PURGE',
      'ESCALATION',
    ]);
  });

  it('AUTO_MOD_RULE_TYPES has exactly the 16 documented rule types', () => {
    expect(AUTO_MOD_RULE_TYPES).toHaveLength(16);
    expect([...AUTO_MOD_RULE_TYPES]).toEqual([
      'SPAM',
      'FLOOD',
      'DUPLICATE',
      'MENTION_SPAM',
      'MASS_MENTION',
      'EXCESSIVE_CAPS',
      'EXCESSIVE_EMOJI',
      'INVITE',
      'URL',
      'PHISHING',
      'BAD_WORDS',
      'NSFW',
      'RAID',
      'ACCOUNT_AGE',
      'ATTACHMENT',
      'BOT_ABUSE',
    ]);
  });

  it('AUTOMATION_TRIGGER_TYPES has exactly the 12 documented triggers', () => {
    expect(AUTOMATION_TRIGGER_TYPES).toHaveLength(12);
    expect([...AUTOMATION_TRIGGER_TYPES]).toEqual([
      'MEMBER_JOIN',
      'MEMBER_LEAVE',
      'ROLE_ADDED',
      'ROLE_REMOVED',
      'MESSAGE_SENT',
      'KEYWORD_DETECTED',
      'LEVEL_REACHED',
      'TICKET_CREATED',
      'TICKET_CLOSED',
      'GIVEAWAY_ENDED',
      'SCHEDULED',
      'MILESTONE',
    ]);
  });

  it('AUTOMATION_ACTION_TYPES has exactly the 11 documented actions', () => {
    expect(AUTOMATION_ACTION_TYPES).toHaveLength(11);
    expect([...AUTOMATION_ACTION_TYPES]).toEqual([
      'SEND_MESSAGE',
      'SEND_DM',
      'ADD_ROLE',
      'REMOVE_ROLE',
      'TIMEOUT',
      'CREATE_CHANNEL',
      'DELETE_CHANNEL',
      'LOG_EVENT',
      'CREATE_TICKET',
      'CHANGE_NICKNAME',
      'SEND_WEBHOOK',
    ]);
  });

  it('ADMIN_ROLES has exactly the 6 platform staff roles', () => {
    expect(ADMIN_ROLES).toHaveLength(6);
    expect([...ADMIN_ROLES]).toEqual([
      'OWNER',
      'ADMINISTRATOR',
      'SUPPORT',
      'MODERATOR',
      'DEVELOPER',
      'ANALYST',
    ]);
  });

  it('covers the remaining enum sets with their documented values', () => {
    expect([...SUBSCRIPTION_STATUSES]).toEqual([
      'ACTIVE',
      'PAST_DUE',
      'CANCELLED',
      'TRIALING',
      'EXPIRED',
    ]);
    expect([...TICKET_STATUSES]).toEqual(['OPEN', 'CLAIMED', 'CLOSED', 'REOPENED']);
    expect([...TICKET_PRIORITIES]).toEqual(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
    expect([...GIVEAWAY_STATUSES]).toEqual(['RUNNING', 'ENDED', 'CANCELLED']);
    expect([...AUTO_MOD_ACTION_TYPES]).toEqual([
      'DELETE',
      'WARN',
      'TIMEOUT',
      'KICK',
      'BAN',
      'ADD_ROLE',
      'REMOVE_ROLE',
      'ALERT_MODS',
    ]);
    expect([...WEBHOOK_DELIVERY_STATUSES]).toEqual([
      'PENDING',
      'DELIVERED',
      'FAILED',
      'RETRYING',
      'DISABLED',
    ]);
  });

  it('DB_ENUMS exposes every enum set keyed by its union type name', () => {
    expect(Object.keys(DB_ENUMS)).toEqual([
      'CaseType',
      'SubscriptionStatus',
      'SubscriptionPlan',
      'TicketStatus',
      'TicketPriority',
      'GiveawayStatus',
      'AutoModRuleType',
      'AutoModActionType',
      'AutomationTriggerType',
      'AutomationActionType',
      'AdminRole',
      'WebhookDeliveryStatus',
    ]);
    expect(DB_ENUMS.CaseType).toBe(CASE_TYPES);
    expect(DB_ENUMS.SubscriptionPlan).toEqual(['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE']);
  });

  it('contains no duplicate values inside any enum set', () => {
    for (const set of Object.values(DB_ENUMS)) {
      expect(new Set(set).size).toBe(set.length);
    }
  });
});

describe('type guards', () => {
  it('isCaseType accepts known values and rejects unknown ones', () => {
    for (const t of CASE_TYPES) expect(isCaseType(t)).toBe(true);
    expect(isCaseType('NOPE')).toBe(false);
    expect(isCaseType('warn')).toBe(false); // case sensitive
    expect(isCaseType('')).toBe(false);
  });

  it('isTicketStatus / isGiveawayStatus narrow correctly', () => {
    expect(isTicketStatus('OPEN')).toBe(true);
    expect(isTicketStatus('open')).toBe(false);
    expect(isGiveawayStatus('RUNNING')).toBe(true);
    expect(isGiveawayStatus('DELETED')).toBe(false);
  });

  it('automod / automation guards narrow correctly', () => {
    expect(isAutoModActionType('ALERT_MODS')).toBe(true);
    expect(isAutoModActionType('ALERT')).toBe(false);
    expect(isAutomationTriggerType('MEMBER_JOIN')).toBe(true);
    expect(isAutomationTriggerType('member.join')).toBe(false); // not webhook syntax
    expect(isAutomationActionType('SEND_WEBHOOK')).toBe(true);
    expect(isAutomationActionType('webhook')).toBe(false);
  });

  it('isAdminRole / isWebhookDeliveryStatus narrow correctly', () => {
    for (const r of ADMIN_ROLES) expect(isAdminRole(r)).toBe(true);
    expect(isAdminRole('SUPERUSER')).toBe(false);
    expect(isWebhookDeliveryStatus('PENDING')).toBe(true);
    expect(isWebhookDeliveryStatus('pending')).toBe(false);
  });
});

describe('ADMIN_ROLE_RANK hierarchy', () => {
  it('ranks OWNER above ADMINISTRATOR above DEVELOPER', () => {
    expect(ADMIN_ROLE_RANK.OWNER).toBeGreaterThan(ADMIN_ROLE_RANK.ADMINISTRATOR);
    expect(ADMIN_ROLE_RANK.ADMINISTRATOR).toBeGreaterThan(ADMIN_ROLE_RANK.DEVELOPER);
  });

  it('ranks DEVELOPER above SUPPORT and MODERATOR, which rank above ANALYST', () => {
    expect(ADMIN_ROLE_RANK.DEVELOPER).toBeGreaterThan(ADMIN_ROLE_RANK.SUPPORT);
    expect(ADMIN_ROLE_RANK.DEVELOPER).toBeGreaterThan(ADMIN_ROLE_RANK.MODERATOR);
    expect(ADMIN_ROLE_RANK.SUPPORT).toBeGreaterThan(ADMIN_ROLE_RANK.ANALYST);
    expect(ADMIN_ROLE_RANK.MODERATOR).toBeGreaterThan(ADMIN_ROLE_RANK.ANALYST);
  });

  it('uses the documented numeric ranks', () => {
    expect(ADMIN_ROLE_RANK).toEqual({
      OWNER: 100,
      ADMINISTRATOR: 80,
      DEVELOPER: 60,
      SUPPORT: 40,
      MODERATOR: 40,
      ANALYST: 20,
    });
  });

  it('assigns a rank to every admin role (and only those)', () => {
    expect(Object.keys(ADMIN_ROLE_RANK).sort()).toEqual([...ADMIN_ROLES].sort());
  });
});
