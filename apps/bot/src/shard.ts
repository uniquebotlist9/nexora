import { Client, GatewayIntentBits, Partials } from 'discord.js';
import type { Cache } from '@nexora/cache';
import { createLogger } from '@nexora/logger';
import { setContext } from './core/context';
import { attachEvents } from './framework/events';
import { events } from './events';
// Importing the registry loads every command module, which registers the
// component ("ticket:…", "giveaway:…", "help:…", …) and confirmation handlers.
import './commands/registry';

/**
 * Start one bot process (a shard worker when spawned by the ShardingManager,
 * or the whole bot in single-process mode).
 */
export async function startBot(token: string, cache: Cache): Promise<Client> {
  const log = createLogger('bot/shard', { shard: process.env.SHARDS ?? '0' });

  const managedShard = process.env.SHARDING_MANAGER !== undefined;
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Reaction, Partials.Channel],
    ...(managedShard && process.env.SHARDS && process.env.SHARD_COUNT
      ? {
          shards: Number(process.env.SHARDS),
          shardCount: Number(process.env.SHARD_COUNT),
        }
      : {}),
  });

  setContext({ client, cache, log, startedAt: Date.now() });
  attachEvents(client, events);
  await client.login(token);
  return client;
}
