import type { Client } from 'discord.js';
import type { Cache } from '@nexora/cache';
import type { Logger } from '@nexora/logger';

/**
 * Process-wide bot context: the discord.js client, the shared cache and the
 * root logger. Initialized once at startup (single process or shard worker)
 * and consumed by services, events and commands.
 */
export interface BotContext {
  client: Client;
  cache: Cache;
  log: Logger;
  startedAt: number;
}

let current: BotContext | null = null;

export function setContext(ctx: BotContext): void {
  current = ctx;
}

export function getContext(): BotContext {
  if (!current) {
    throw new Error('Bot context accessed before initialization');
  }
  return current;
}

export function tryGetContext(): BotContext | null {
  return current;
}

/** True when this process is the (or the only) shard that owns background jobs. */
export function isPrimaryWorker(client: Client): boolean {
  const shard = client.shard;
  if (!shard) return true;
  return shard.ids.includes(0);
}
