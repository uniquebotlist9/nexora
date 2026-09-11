import type { Cache } from '@nexora/cache';
import type { Logger } from '@nexora/logger';

/** Shared dependencies threaded through routers and middleware. */
export interface AppDeps {
  cache: Cache;
  logger: Logger;
}
