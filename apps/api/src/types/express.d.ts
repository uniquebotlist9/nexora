/**
 * Express request augmentation used across the API.
 *
 * - `requestId` / `log`: assigned by the request-context middleware for every
 *   request; the id is echoed back in the `X-Request-Id` response header and in
 *   every error envelope.
 * - `rawBody`: captured by express.json's `verify` hook so payment webhook
 *   signatures can be computed over the exact bytes the provider signed.
 * - `apiKey`: attached by the API key auth middleware.
 * - `guild`: attached by the guild access guard (guild-scoped routers).
 */
import type { Logger } from '@nexora/logger';
import type { Guild } from '@nexora/database';
import type { ApiKeyContext } from '../auth/api-key';
import type { DiscordUserContext } from '../lib/discord-token';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      log: Logger;
      rawBody?: Buffer;
      apiKey?: ApiKeyContext;
      guild?: Guild;
      discordUser?: DiscordUserContext;
    }
  }
}

export {};
