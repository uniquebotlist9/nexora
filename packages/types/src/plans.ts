/**
 * Subscription plan tiers and the feature limits attached to each tier.
 * The single source of truth for premium gating across bot, API and dashboard.
 */

export const PLAN_TIERS = ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export interface PlanLimits {
  /** Max automations (If This → Then That workflows) per guild. */
  automations: number;
  /** Max custom slash commands per guild. */
  customCommands: number;
  /** Max AutoMod rules per guild. */
  autoModRules: number;
  /** Stored backups per guild. */
  backups: number;
  /** Scheduled/in-progress giveaways per guild. */
  giveaways: number;
  /** Max distinct role-menu messages per guild. */
  reactionRoleMessages: number;
  /** Max ticket types per guild. */
  ticketTypes: number;
  /** How far back analytics data is queryable (days). */
  analyticsRetentionDays: number;
  /** AI features (assistant, ticket classification, AI embeds, ...). */
  ai: boolean;
  /** Premium welcome/goodbye image cards. */
  welcomeCards: boolean;
  /** Custom branding (embed color, footer branding removal). */
  customBranding: boolean;
  /** Extended (90 day) log retention. */
  extendedLogs: boolean;
  /** Developer API keys per user. */
  apiKeys: number;
  /** Scheduled automations / recurring backups per guild. */
  scheduledJobs: number;
  /** Economy system. */
  economy: boolean;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  FREE: {
    automations: 3,
    customCommands: 5,
    autoModRules: 5,
    backups: 1,
    giveaways: 3,
    reactionRoleMessages: 3,
    ticketTypes: 3,
    analyticsRetentionDays: 7,
    ai: false,
    welcomeCards: false,
    customBranding: false,
    extendedLogs: false,
    apiKeys: 0,
    scheduledJobs: 3,
    economy: true,
  },
  PRO: {
    automations: 25,
    customCommands: 50,
    autoModRules: 25,
    backups: 10,
    giveaways: 25,
    reactionRoleMessages: 15,
    ticketTypes: 10,
    analyticsRetentionDays: 90,
    ai: true,
    welcomeCards: true,
    customBranding: true,
    extendedLogs: true,
    apiKeys: 2,
    scheduledJobs: 25,
    economy: true,
  },
  BUSINESS: {
    automations: 100,
    customCommands: 200,
    autoModRules: 100,
    backups: 50,
    giveaways: 100,
    reactionRoleMessages: 50,
    ticketTypes: 25,
    analyticsRetentionDays: 365,
    ai: true,
    welcomeCards: true,
    customBranding: true,
    extendedLogs: true,
    apiKeys: 10,
    scheduledJobs: 100,
    economy: true,
  },
  ENTERPRISE: {
    automations: 1000,
    customCommands: 1000,
    autoModRules: 1000,
    backups: 500,
    giveaways: 1000,
    reactionRoleMessages: 500,
    ticketTypes: 100,
    analyticsRetentionDays: 730,
    ai: true,
    welcomeCards: true,
    customBranding: true,
    extendedLogs: true,
    apiKeys: 100,
    scheduledJobs: 1000,
    economy: true,
  },
};

export function isPlanTier(value: string): value is PlanTier {
  return (PLAN_TIERS as readonly string[]).includes(value);
}

/** Resolve effective limits for a guild, given its subscription plan. */
export function limitsForPlan(plan: PlanTier): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.FREE;
}
