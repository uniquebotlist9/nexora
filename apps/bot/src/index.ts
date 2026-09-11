import path from 'node:path';
import type http from 'node:http';
import { ShardingManager, type Client } from 'discord.js';
import { createCache } from '@nexora/cache';
import { createLogger, serializeError } from '@nexora/logger';
import { getEnv, isProduction, requireEnv, shardCount } from '@nexora/config';
import { prisma } from '@nexora/database';
import { startHealthServer, stopHealthServer } from './health';
import { startBot } from './shard';
import { stopScheduler } from './services/scheduler';

const log = createLogger('bot');

/**
 * Resolve the shard mode: an explicit SHARD_COUNT > 1, or "auto" in
 * production, runs the ShardingManager; everything else is single-process.
 */
function shouldUseSharding(): boolean {
  const shards = shardCount();
  if (typeof shards === 'number') return shards > 1;
  return isProduction();
}

function workerPath(): { file: string; execArgv: string[] | undefined } {
  if (__filename.endsWith('.ts')) {
    // Running from source (tsx): shard workers need the TS loader too.
    return { file: path.join(__dirname, 'shard.ts'), execArgv: ['--import', 'tsx'] };
  }
  return { file: path.join(__dirname, 'shard.js'), execArgv: undefined };
}

async function main(): Promise<void> {
  const env = getEnv();

  let token: string;
  try {
    token = requireEnv('DISCORD_TOKEN');
  } catch (err) {
    log.error({ err: serializeError(err) }, 'DISCORD_TOKEN is not configured');
    console.error(
      '\n❌ Missing required environment variable DISCORD_TOKEN.\n' +
        '   Add it to the .env file at the repository root (see .env.example) and try again.\n',
    );
    process.exit(1);
  }

  const cache = await createCache(env.REDIS_URL);
  log.info({ redis: env.REDIS_URL ? 'connected' : 'in-memory fallback' }, 'Cache initialized');

  let manager: ShardingManager | null = null;
  let client: Client | null = null;
  let healthServer: http.Server;

  if (shouldUseSharding() && process.env.SHARDING_MANAGER === undefined) {
    const { file, execArgv } = workerPath();
    const shards = shardCount();
    manager = new ShardingManager(file, {
      token,
      totalShards: shards === 'auto' ? 'auto' : shards,
      ...(execArgv ? { execArgv } : {}),
    });
    manager.on('shardCreate', (shard) => {
      log.info({ shardId: shard.id }, 'Shard spawned');
      shard.on('death', () => log.warn({ shardId: shard.id }, 'Shard died (manager will respawn it)'));
      shard.on('ready', () => log.info({ shardId: shard.id }, 'Shard ready'));
      shard.on('disconnect', () => log.warn({ shardId: shard.id }, 'Shard disconnected'));
      shard.on('reconnecting', () => log.info({ shardId: shard.id }, 'Shard reconnecting'));
    });
    healthServer = startHealthServer({
      cache,
      discordReady: () => manager?.shards.some((shard) => shard.ready) ?? false,
      port: env.BOT_HEALTH_PORT,
    });
    await manager.spawn();
    log.info({ totalShards: manager.totalShards }, 'Sharding manager running');
  } else {
    client = await startBot(token, cache);
    healthServer = startHealthServer({
      cache,
      discordReady: () => client?.isReady() ?? false,
      port: env.BOT_HEALTH_PORT,
    });
  }

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, 'Graceful shutdown started');
    try {
      if (manager) {
        // discord.js v14 has no ShardingManager#destroy — destroy each shard's client instead.
        await manager.broadcastEval((shard) => shard.destroy()).catch(() => undefined);
      } else {
        client?.destroy();
      }
      stopScheduler();
      await cache.close();
      await prisma.$disconnect();
      await stopHealthServer(healthServer);
      log.info('Shutdown complete');
      process.exit(0);
    } catch (err) {
      log.error({ err: serializeError(err) }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  log.error({ err: serializeError(reason) }, 'Unhandled promise rejection');
});

main().catch((err) => {
  log.error({ err: serializeError(err) }, 'Fatal startup error');
  process.exit(1);
});
