/**
 * API key constants shared by the profile page (client) and its server
 * actions. Mirrors `SCOPES` / `API_KEY_PREFIX` in the API package — kept here
 * so the client bundle never imports server-side crypto code.
 */

export const API_KEY_PREFIX = 'nxk_';

export interface ApiKeyScopeInfo {
  value: string;
  label: string;
  description: string;
}

export const API_KEY_SCOPES: ApiKeyScopeInfo[] = [
  {
    value: 'guilds:read',
    label: 'guilds:read',
    description: 'Read guild settings, moderation cases, tickets, giveaways, ...',
  },
  {
    value: 'guilds:write',
    label: 'guilds:write',
    description: 'Update guild settings and manage configurations',
  },
  {
    value: 'analytics:read',
    label: 'analytics:read',
    description: 'Read analytics, leaderboards and usage statistics',
  },
  {
    value: 'webhooks:manage',
    label: 'webhooks:manage',
    description: 'Create, test and delete webhook endpoints',
  },
];

export const API_KEY_SCOPE_VALUES = API_KEY_SCOPES.map((s) => s.value);

/** Mirrors the API-side per-user key creation limiter (actions per minute). */
export const MAX_KEY_ACTIONS_PER_MINUTE = 20;

export const MAX_API_KEY_RATE_LIMIT = 600;
