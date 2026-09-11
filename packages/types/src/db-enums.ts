// ==============================================================================
// Database value enums
// ==============================================================================
// The Prisma MongoDB connector does not support `enum` declarations, so every
// enum-typed field in the schema is a plain String. These const objects are the
// single source of truth for the allowed values and must stay in sync with the
// field comments in packages/database/prisma/schema.prisma. All writes go
// through the zod schemas in @nexora/validation, which validate against these
// same values.

export const CASE_TYPES = [
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
] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const SUBSCRIPTION_STATUSES = [
  'ACTIVE',
  'PAST_DUE',
  'CANCELLED',
  'TRIALING',
  'EXPIRED',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const TICKET_STATUSES = ['OPEN', 'CLAIMED', 'CLOSED', 'REOPENED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const GIVEAWAY_STATUSES = ['RUNNING', 'ENDED', 'CANCELLED'] as const;
export type GiveawayStatus = (typeof GIVEAWAY_STATUSES)[number];

export const AUTO_MOD_RULE_TYPES = [
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
] as const;
export type AutoModRuleType = (typeof AUTO_MOD_RULE_TYPES)[number];

export const AUTO_MOD_ACTION_TYPES = [
  'DELETE',
  'WARN',
  'TIMEOUT',
  'KICK',
  'BAN',
  'ADD_ROLE',
  'REMOVE_ROLE',
  'ALERT_MODS',
] as const;
export type AutoModActionType = (typeof AUTO_MOD_ACTION_TYPES)[number];

export const AUTOMATION_TRIGGER_TYPES = [
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
] as const;
export type AutomationTriggerType = (typeof AUTOMATION_TRIGGER_TYPES)[number];

export const AUTOMATION_ACTION_TYPES = [
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
] as const;
export type AutomationActionType = (typeof AUTOMATION_ACTION_TYPES)[number];

export const ADMIN_ROLES = [
  'OWNER',
  'ADMINISTRATOR',
  'SUPPORT',
  'MODERATOR',
  'DEVELOPER',
  'ANALYST',
] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** Ranking for the platform staff role hierarchy (higher = more access). */
export const ADMIN_ROLE_RANK: Record<AdminRole, number> = {
  OWNER: 100,
  ADMINISTRATOR: 80,
  SUPPORT: 40,
  MODERATOR: 40,
  DEVELOPER: 60,
  ANALYST: 20,
};

export const WEBHOOK_DELIVERY_STATUSES = [
  'PENDING',
  'DELIVERED',
  'FAILED',
  'RETRYING',
  'DISABLED',
] as const;
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

/** All DB string-enum value sets, keyed by their union type name. */
export const DB_ENUMS = {
  CaseType: CASE_TYPES,
  SubscriptionStatus: SUBSCRIPTION_STATUSES,
  SubscriptionPlan: ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE'],
  TicketStatus: TICKET_STATUSES,
  TicketPriority: TICKET_PRIORITIES,
  GiveawayStatus: GIVEAWAY_STATUSES,
  AutoModRuleType: AUTO_MOD_RULE_TYPES,
  AutoModActionType: AUTO_MOD_ACTION_TYPES,
  AutomationTriggerType: AUTOMATION_TRIGGER_TYPES,
  AutomationActionType: AUTOMATION_ACTION_TYPES,
  AdminRole: ADMIN_ROLES,
  WebhookDeliveryStatus: WEBHOOK_DELIVERY_STATUSES,
} as const;

export function isCaseType(v: string): v is CaseType {
  return (CASE_TYPES as readonly string[]).includes(v);
}
export function isTicketStatus(v: string): v is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(v);
}
export function isGiveawayStatus(v: string): v is GiveawayStatus {
  return (GIVEAWAY_STATUSES as readonly string[]).includes(v);
}
export function isAutoModRuleType(v: string): v is AutoModRuleType {
  return (AUTO_MOD_RULE_TYPES as readonly string[]).includes(v);
}
export function isAutoModActionType(v: string): v is AutoModActionType {
  return (AUTO_MOD_ACTION_TYPES as readonly string[]).includes(v);
}
export function isAutomationTriggerType(v: string): v is AutomationTriggerType {
  return (AUTOMATION_TRIGGER_TYPES as readonly string[]).includes(v);
}
export function isAutomationActionType(v: string): v is AutomationActionType {
  return (AUTOMATION_ACTION_TYPES as readonly string[]).includes(v);
}
export function isAdminRole(v: string): v is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(v);
}
export function isWebhookDeliveryStatus(v: string): v is WebhookDeliveryStatus {
  return (WEBHOOK_DELIVERY_STATUSES as readonly string[]).includes(v);
}
