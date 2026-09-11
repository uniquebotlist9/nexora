import { z } from 'zod';

// ============================================================================
// Primitives
// ============================================================================

export const snowflakeSchema = z
  .string()
  .regex(/^\d{15,21}$/, 'Must be a Discord ID (17-20 digits)');

export const hexColorSchema = z
  .string()
  .regex(/^#?[0-9a-fA-F]{6}$/, 'Must be a hex color like #5865F2');

export const urlSchema = z.string().url().max(2048);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

// ============================================================================
// Embeds & messages (custom commands, welcome, automations, tickets, ...)
// ============================================================================

export const embedFieldSchema = z.object({
  name: z.string().min(1).max(256),
  value: z.string().min(1).max(1024),
  inline: z.boolean().optional().default(false),
});

export const embedSchema = z
  .object({
    title: z.string().max(256).optional(),
    description: z.string().max(4096).optional(),
    url: urlSchema.optional(),
    color: z.number().int().min(0).max(0xffffff).optional(),
    fields: z.array(embedFieldSchema).max(25).optional(),
    author: z.object({ name: z.string().max(256), url: urlSchema.optional(), iconUrl: urlSchema.optional() }).optional(),
    footer: z.object({ text: z.string().max(2048), iconUrl: urlSchema.optional() }).optional(),
    image: urlSchema.optional(),
    thumbnail: urlSchema.optional(),
    timestamp: z.boolean().optional(),
  })
  .refine((data) => Boolean(data.title || data.description || (data.fields?.length ?? 0) > 0 || data.image || data.thumbnail), {
    message: 'Embed must have a title, description, field, image or thumbnail',
  });

export const buttonSchema = z.object({
  label: z.string().min(1).max(80),
  style: z.enum(['PRIMARY', 'SECONDARY', 'SUCCESS', 'DANGER', 'LINK']),
  url: urlSchema.optional(),
  emoji: z.string().max(64).optional(),
});

export const messagePayloadSchema = z
  .object({
    content: z.string().max(2000).optional(),
    embed: embedSchema.optional(),
    buttons: z.array(buttonSchema).max(5).optional(),
  })
  .refine((data) => Boolean(data.content || data.embed), {
    message: 'Message must have content or an embed',
  });

// ============================================================================
// Moderation
// ============================================================================

export const escalationStepSchema = z.object({
  /** Trigger when a member accumulates this many active warnings. */
  warnings: z.number().int().min(1).max(100),
  action: z.enum(['timeout', 'kick', 'tempban', 'ban']),
  durationMinutes: z.number().int().min(1).max(60 * 24 * 365).optional(),
});

export const escalationConfigSchema = z.object({
  steps: z.array(escalationStepSchema).max(10).default([]),
  resetOnEscalate: z.boolean().default(true),
});

export const modActionInputSchema = z.object({
  targetId: snowflakeSchema,
  reason: z.string().min(1).max(1000).default('No reason provided'),
  durationMinutes: z.number().int().min(1).max(60 * 24 * 365).optional(),
  evidence: z.array(urlSchema).max(5).optional(),
  notifyUser: z.boolean().optional().default(true),
});

// ============================================================================
// AutoMod
// ============================================================================

export const autoModActionSchema = z.object({
  type: z.enum(['DELETE', 'WARN', 'TIMEOUT', 'KICK', 'BAN', 'ADD_ROLE', 'REMOVE_ROLE', 'ALERT_MODS']),
  durationMinutes: z.number().int().min(1).max(60 * 24 * 365).optional(),
  roleId: snowflakeSchema.optional(),
  points: z.number().int().min(1).max(100).optional(),
});

export const autoModTriggerSchema = z.object({
  /** Threshold count within `windowSeconds` (spam/flood/mentions/...). */
  threshold: z.number().int().min(1).max(1000).optional(),
  windowSeconds: z.number().int().min(1).max(3600).optional(),
  /** Percentage of uppercase characters (caps rule). */
  capsPercent: z.number().int().min(1).max(100).optional(),
  /** Max emoji occurrences. */
  maxEmojis: z.number().int().min(1).max(1000).optional(),
  /** Max attachments per message. */
  maxAttachments: z.number().int().min(1).max(100).optional(),
  /** Min message similarity for duplicates (0-1). */
  similarity: z.number().min(0.1).max(1).optional(),
  /** Blocked words / patterns (word & regex rules). */
  words: z.array(z.string().min(1).max(100)).max(500).optional(),
  caseSensitive: z.boolean().optional(),
  /** Whitelisted URLs / words. */
  whitelist: z.array(z.string().min(1).max(200)).max(500).optional(),
  /** Min account age in hours (account-age / anti-raid rules). */
  minAccountAgeHours: z.number().int().min(0).max(100000).optional(),
  /** Max joins per window (raid rule). */
  joinThreshold: z.number().int().min(2).max(1000).optional(),
});

export const autoModRuleInputSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum([
    'SPAM', 'FLOOD', 'DUPLICATE', 'MENTION_SPAM', 'MASS_MENTION', 'EXCESSIVE_CAPS',
    'EXCESSIVE_EMOJI', 'INVITE', 'URL', 'PHISHING', 'BAD_WORDS', 'NSFW', 'RAID',
    'ACCOUNT_AGE', 'ATTACHMENT', 'BOT_ABUSE',
  ]),
  enabled: z.boolean().default(true),
  trigger: autoModTriggerSchema.default({}),
  actions: z.array(autoModActionSchema).min(1).max(5),
  exemptRoleIds: z.array(snowflakeSchema).max(50).default([]),
  exemptChannelIds: z.array(snowflakeSchema).max(500).default([]),
});

// ============================================================================
// Automation engine (If This → Then That)
// ============================================================================

export const automationTriggerInputSchema = z.object({
  type: z.enum([
    'MEMBER_JOIN', 'MEMBER_LEAVE', 'ROLE_ADDED', 'ROLE_REMOVED', 'MESSAGE_SENT',
    'KEYWORD_DETECTED', 'LEVEL_REACHED', 'TICKET_CREATED', 'TICKET_CLOSED',
    'GIVEAWAY_ENDED', 'SCHEDULED', 'MILESTONE',
  ]),
  config: z
    .object({
      keywords: z.array(z.string().min(1).max(100)).max(50).optional(),
      roleId: snowflakeSchema.optional(),
      level: z.number().int().min(1).max(1000).optional(),
      /** Cron-like schedule or fixed interval for SCHEDULED triggers. */
      intervalMinutes: z.number().int().min(1).max(525600).optional(),
      cron: z.string().max(100).optional(),
      /** Member count milestone (100, 1000, ...). */
      memberCount: z.number().int().min(1).optional(),
    })
    .default({}),
});

export const automationActionInputSchema = z.object({
  type: z.enum([
    'SEND_MESSAGE', 'SEND_DM', 'ADD_ROLE', 'REMOVE_ROLE', 'TIMEOUT', 'CREATE_CHANNEL',
    'DELETE_CHANNEL', 'LOG_EVENT', 'CREATE_TICKET', 'CHANGE_NICKNAME', 'SEND_WEBHOOK',
  ]),
  config: z
    .object({
      channelId: snowflakeSchema.optional(),
      message: messagePayloadSchema.optional(),
      roleId: snowflakeSchema.optional(),
      durationMinutes: z.number().int().min(1).max(60 * 24 * 365).optional(),
      channelName: z.string().max(100).optional(),
      nickname: z.string().max(32).optional(),
      webhookUrl: urlSchema.optional(),
      ticketType: z.string().max(50).optional(),
    })
    .default({}),
});

export const automationInputSchema = z.object({
  name: z.string().min(1).max(100),
  enabled: z.boolean().default(true),
  trigger: automationTriggerInputSchema,
  actions: z.array(automationActionInputSchema).min(1).max(10),
});

// ============================================================================
// Welcome / farewell
// ============================================================================

export const welcomeConfigInputSchema = z.object({
  welcomeEnabled: z.boolean().default(false),
  welcomeChannelId: snowflakeSchema.optional(),
  welcomeMessage: messagePayloadSchema.optional(),
  welcomeDmEnabled: z.boolean().default(false),
  welcomeDmMessage: messagePayloadSchema.optional(),
  welcomeCardEnabled: z.boolean().default(false),
  autoRoleIds: z.array(snowflakeSchema).max(10).default([]),
  farewellEnabled: z.boolean().default(false),
  farewellChannelId: snowflakeSchema.optional(),
  farewellMessage: messagePayloadSchema.optional(),
  farewellCardEnabled: z.boolean().default(false),
});

// ============================================================================
// Tickets
// ============================================================================

export const ticketTypeSchema = z.object({
  id: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  description: z.string().max(200).default(''),
  emoji: z.string().max(64).optional(),
  categoryId: snowflakeSchema.optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('LOW'),
});

export const ticketConfigInputSchema = z.object({
  enabled: z.boolean().default(false),
  channelId: snowflakeSchema.optional(),
  transcriptChannelId: snowflakeSchema.optional(),
  staffRoleIds: z.array(snowflakeSchema).max(20).default([]),
  blacklist: z.array(snowflakeSchema).max(500).default([]),
  types: z.array(ticketTypeSchema).max(100).default([]),
  inactivityHours: z.number().int().min(1).max(720).default(48),
  claimRequired: z.boolean().default(false),
});

// ============================================================================
// Giveaways
// ============================================================================

export const giveawayCreateInputSchema = z
  .object({
    channelId: snowflakeSchema,
    prize: z.string().min(1).max(256),
    description: z.string().max(1000).optional(),
    winnerCount: z.number().int().min(1).max(50),
    durationMinutes: z.number().int().min(1).max(60 * 24 * 30),
    requiredRoleId: snowflakeSchema.optional(),
    minAccountAgeDays: z.number().int().min(0).max(3650).optional(),
    minMembershipDays: z.number().int().min(0).max(3650).optional(),
    minMessages: z.number().int().min(0).max(1000000).optional(),
    bonusRoles: z.array(z.object({ roleId: snowflakeSchema, extraEntries: z.number().int().min(1).max(100) })).max(10).optional(),
  })
  .refine((data) => data.durationMinutes > 0, { message: 'Duration must be positive' });

// ============================================================================
// Custom commands
// ============================================================================

export const customCommandInputSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9-]+$/, 'Command name must be lowercase letters, numbers and dashes'),
  description: z.string().min(1).max(100),
  response: messagePayloadSchema,
  cooldownSeconds: z.number().int().min(0).max(3600).default(3),
  requiredRoleIds: z.array(snowflakeSchema).max(10).default([]),
  requiredPermission: z.string().max(64).optional(),
  enabled: z.boolean().default(true),
});

// ============================================================================
// Webhooks
// ============================================================================

export const webhookEndpointInputSchema = z.object({
  name: z.string().min(1).max(100),
  url: urlSchema,
  events: z.array(z.string().min(1)).min(1).max(50),
});

// ============================================================================
// Leveling / economy / misc
// ============================================================================

export const levelConfigInputSchema = z.object({
  enabled: z.boolean().default(true),
  xpMin: z.number().int().min(1).max(100).default(10),
  xpMax: z.number().int().min(1).max(100).default(25),
  cooldownSeconds: z.number().int().min(0).max(3600).default(60),
  multipliers: z.array(z.object({ roleId: snowflakeSchema, multiplier: z.number().min(0.1).max(10) })).max(20).default([]),
  ignoreChannelIds: z.array(snowflakeSchema).max(500).default([]),
  announceChannelId: snowflakeSchema.nullable().optional(),
  announceTemplate: z.string().max(2000).optional(),
  dmEnabled: z.boolean().default(false),
  dmTemplate: z.string().max(2000).optional(),
  roleRewards: z.array(z.object({ level: z.number().int().min(1).max(1000), roleId: snowflakeSchema, keepPrevious: z.boolean().default(false) })).max(50).default([]),
});

export const logCategoryNameSchema = z.enum([
  'messageDelete', 'messageEdit', 'memberJoin', 'memberLeave', 'ban', 'unban', 'kick',
  'timeout', 'roleChanges', 'channelChanges', 'serverChanges', 'voice', 'nickname',
  'invites', 'moderation', 'tickets', 'giveaways', 'verification', 'automod',
]);

export const logConfigInputSchema = z.object({
  enabled: z.boolean().default(false),
  config: z.record(logCategoryNameSchema, z.object({ enabled: z.boolean().default(false), channelId: snowflakeSchema.optional() })),
  ignoredChannelIds: z.array(snowflakeSchema).max(500).default([]),
});

export const reminderCreateSchema = z.object({
  content: z.string().min(1).max(1000),
  durationMinutes: z.number().int().min(1).max(60 * 24 * 365),
});

export type EmbedInput = z.infer<typeof embedSchema>;
export type MessagePayloadInput = z.infer<typeof messagePayloadSchema>;
export type AutoModRuleInput = z.infer<typeof autoModRuleInputSchema>;
export type AutomationInput = z.infer<typeof automationInputSchema>;
export type WelcomeConfigInput = z.infer<typeof welcomeConfigInputSchema>;
export type TicketConfigInput = z.infer<typeof ticketConfigInputSchema>;
export type GiveawayCreateInput = z.infer<typeof giveawayCreateInputSchema>;
export type CustomCommandInput = z.infer<typeof customCommandInputSchema>;
export type LevelConfigInput = z.infer<typeof levelConfigInputSchema>;
