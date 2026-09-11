/**
 * Nexora REST API — bootstrap.
 *
 * Responsibilities:
 *  - validate environment (@nexora/config)
 *  - structured logging (@nexora/logger)
 *  - shared cache (Redis when REDIS_URL is set, in-memory fallback)
 *  - HTTP server on API_PORT (Express app built in ./app)
 *  - webhook delivery worker (same process)
 *  - graceful shutdown on SIGINT/SIGTERM: stop accepting connections, wait
 *    for in-flight requests, stop the worker, close the cache, disconnect Prisma.
 */
import { createLogger } from '@nexora/logger';
import { createCache } from '@nexora/cache';
import { getEnv, isProduction } from '@nexora/config';
import { prisma } from '@nexora/database';
import type { Server } from 'node:http';
import { createApp } from './app';
import { startWebhookWorker } from './worker/webhooks';

async function main(): Promise<void> {
  const env = getEnv();

  // @nexora/config applies defaults (e.g. the local MongoDB URL) inside its
  // parsed env object, but the Prisma client reads process.env directly.
  // Propagate the resolved value so both see the same database. Must happen
  // before the first query — Prisma resolves DATABASE_URL lazily.
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = env.DATABASE_URL;
  }

  const logger = createLogger('api', { env: env.NODE_ENV });
  const cache = await createCache(env.REDIS_URL);
  logger.info(
    { redis: Boolean(env.REDIS_URL), port: env.API_PORT, production: isProduction() },
    'Starting Nexora API',
  );

  const app = createApp({ cache, logger });
  const server: Server = app.listen(env.API_PORT, () => {
    logger.info({ port: env.API_PORT }, 'HTTP server listening');
  });

  const worker = startWebhookWorker(logger);

  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Graceful shutdown started');

    // Stop the delivery worker first so no new deliveries start while the
    // HTTP server is still draining.
    worker.stop();

    server.close(() => {
      logger.info('HTTP server closed');
    });
    // Give in-flight requests up to 10s to finish, then force-exit.
    const forceExit = setTimeout(() => {
      logger.warn('Forced exit after shutdown timeout');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    await Promise.allSettled([cache.close(), prisma.$disconnect()]);
    logger.info('Shutdown complete');
    process.exit(0);
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception — shutting down');
    void shutdown('uncaughtException');
  });
}

main().catch((err) => {
  // Bootstrap failures (bad env, port in use, ...) — log and exit non-zero.
  // eslint-disable-next-line no-console
  console.error('Fatal: API failed to start', err);
  process.exit(1);
});
