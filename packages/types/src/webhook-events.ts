/**
 * Outgoing webhook event catalog. The bot enqueues these events; the API
 * worker delivers them to registered endpoints with an HMAC-SHA256 signature.
 */

export const WEBHOOK_EVENTS = [
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
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEvent(value: string): value is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(value);
}

/** Payload envelope for every delivered webhook. */
export interface WebhookPayload<T = unknown> {
  id: string;
  event: WebhookEvent;
  guildId: string;
  createdAt: string;
  data: T;
}
