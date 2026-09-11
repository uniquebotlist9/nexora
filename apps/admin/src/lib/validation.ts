import { z } from 'zod';
import {
  ADMIN_ROLES,
  CASE_TYPES,
  SUBSCRIPTION_STATUSES,
  TICKET_STATUSES,
  WEBHOOK_DELIVERY_STATUSES,
} from '@nexora/types';

/** Discord snowflake (15-21 digit ID). */
export const snowflakeSchema = z
  .string()
  .trim()
  .regex(/^\d{15,21}$/, 'Must be a valid Discord ID (numeric, 15-21 digits).');

export const planSchema = z.enum(['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE']);
export const premiumPlanSchema = z.enum(['PRO', 'BUSINESS', 'ENTERPRISE']);

export const staffRoleSchema = z.enum(ADMIN_ROLES);

export const caseTypeSchema = z.enum(CASE_TYPES);
export const subscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);
export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export const webhookDeliveryStatusSchema = z.enum(WEBHOOK_DELIVERY_STATUSES);

/** Loose provider filter (internal / stripe / paypal / …). */
export const providerSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Provider cannot be empty.')
  .max(30, 'Provider is limited to 30 characters.');

export const durationDaysSchema = z.coerce
  .number()
  .int('Duration must be a whole number of days.')
  .min(1, 'Duration must be at least 1 day.')
  .max(3650, 'Duration cannot exceed 10 years.');

export const guildNoteSchema = z
  .string()
  .trim()
  .min(1, 'Note cannot be empty.')
  .max(2000, 'Note is limited to 2000 characters.');

/** Database record id (cuid). */
export const recordIdSchema = z.string().trim().min(1).max(64);

export const actorTypeSchema = z.enum(['USER', 'BOT', 'API', 'SYSTEM']);

/** `yyyy-MM-dd` from a date input. */
export const dateInputSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date.')
  .optional();

/** `yyyy-MM-dd` or empty (filter cleared). */
export const optionalDateInputSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Invalid date.');

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input.';
}
