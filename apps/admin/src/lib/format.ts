/**
 * Client-safe formatting helpers and domain constants (no server imports).
 */
import { format, formatDistanceToNow } from 'date-fns';

/** Monthly list price per plan tier (USD) — used for the MRR *estimate*. */
export const PLAN_PRICES: Record<string, number> = {
  FREE: 0,
  PRO: 15,
  BUSINESS: 40,
  ENTERPRISE: 120,
};

export const GRANTABLE_PREMIUM_PLANS = ['PRO', 'BUSINESS', 'ENTERPRISE'] as const;
export const ALL_PLANS = ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE'] as const;

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'MMM d, yyyy');
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'MMM d, yyyy HH:mm');
}

export function formatRelative(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return `${formatDistanceToNow(date)} ago`;
}

export function formatUptime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Truncate long IDs / metadata for table display. */
export function truncate(value: string | null | undefined, max = 24): string {
  if (!value) return '—';
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
