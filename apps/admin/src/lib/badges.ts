/**
 * Client-safe status → badge-variant mappings.
 */
import type { AdminRole } from '@nexora/types';
import type { BadgeVariant } from '@/components/ui/badge';

export const SUBSCRIPTION_STATUS_VARIANT: Record<string, BadgeVariant> = {
  ACTIVE: 'success',
  TRIALING: 'info',
  PAST_DUE: 'warning',
  CANCELLED: 'muted',
  EXPIRED: 'destructive',
};

export const WEBHOOK_STATUS_VARIANT: Record<string, BadgeVariant> = {
  PENDING: 'info',
  DELIVERED: 'success',
  FAILED: 'destructive',
  RETRYING: 'warning',
  DISABLED: 'muted',
};

export const PLAN_VARIANT: Record<string, BadgeVariant> = {
  FREE: 'muted',
  PRO: 'info',
  BUSINESS: 'warning',
  ENTERPRISE: 'success',
};

export const ACTOR_TYPE_VARIANT: Record<string, BadgeVariant> = {
  USER: 'info',
  BOT: 'success',
  API: 'warning',
  SYSTEM: 'muted',
};

export const ADMIN_ROLE_VARIANT: Record<AdminRole, BadgeVariant> = {
  OWNER: 'default',
  ADMINISTRATOR: 'info',
  SUPPORT: 'success',
  MODERATOR: 'warning',
  DEVELOPER: 'destructive',
  ANALYST: 'muted',
};

export const CASE_TYPE_VARIANT: Record<string, BadgeVariant> = {
  WARN: 'warning',
  TIMEOUT: 'warning',
  KICK: 'warning',
  BAN: 'destructive',
  TEMPBAN: 'destructive',
  SOFTBAN: 'destructive',
  MUTE: 'warning',
  UNMUTE: 'success',
  UNBAN: 'success',
  NOTE: 'muted',
  LOCKDOWN: 'destructive',
  PURGE: 'muted',
  ESCALATION: 'info',
};

export const TICKET_STATUS_VARIANT: Record<string, BadgeVariant> = {
  OPEN: 'info',
  CLAIMED: 'warning',
  CLOSED: 'muted',
  REOPENED: 'success',
};

export const APPEAL_STATUS_VARIANT: Record<string, BadgeVariant> = {
  PENDING: 'warning',
  APPROVED: 'success',
  DENIED: 'destructive',
};
