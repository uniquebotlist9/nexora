/** Shared, transport-safe common types used across bot, API and dashboard. */

/** A Discord snowflake ID (17-20 digit string). */
export type Snowflake = string;

export const SNOWFLAKE_REGEX = /^\d{15,21}$/;

export function isSnowflake(value: string): value is Snowflake {
  return SNOWFLAKE_REGEX.test(value);
}

/** Serializable embed definition — shared between DB config, API and dashboard. */
export interface EmbedFieldData {
  name: string;
  value: string;
  inline?: boolean;
}

export interface EmbedData {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: EmbedFieldData[];
  author?: { name: string; url?: string; iconUrl?: string };
  footer?: { text: string; iconUrl?: string };
  image?: string;
  thumbnail?: string;
  timestamp?: boolean;
}

/** A message payload as stored in DB configs / custom commands / automations. */
export interface MessagePayload {
  content?: string;
  embed?: EmbedData;
  buttons?: { label: string; style: 'PRIMARY' | 'SECONDARY' | 'SUCCESS' | 'DANGER' | 'LINK'; url?: string; emoji?: string }[];
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}

/** Bot <-> API shared service status shape. */
export interface ServiceHealth {
  status: 'ok' | 'degraded' | 'down';
  uptimeSeconds: number;
  version: string;
  checks: {
    database: 'ok' | 'down';
    redis: 'ok' | 'down' | 'disabled';
    discord: 'ok' | 'down' | 'unknown';
  };
}

export interface DashboardGuildAccess {
  guildId: string;
  name: string;
  icon: string | null;
  /** Raw Discord permissions bitfield as a decimal string. */
  permissions: string;
  canManage: boolean;
  isAdmin: boolean;
}
