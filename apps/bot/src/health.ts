import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Cache } from '@nexora/cache';
import { prisma } from '@nexora/database';
import type { ServiceHealth } from '@nexora/types';
import { createLogger } from '@nexora/logger';

const VERSION = '1.0.0';
const startedAt = Date.now();
const log = createLogger('bot/health');

export interface HealthServerOptions {
  cache: Cache;
  /** Live readiness probe for the Discord gateway connection(s). */
  discordReady: () => boolean;
  port: number;
}

/**
 * Minimal HTTP health/stats endpoint on BOT_HEALTH_PORT — no external deps.
 * GET /health returns the ServiceHealth JSON consumed by the API, uptime
 * monitors and container probes.
 */
export function startHealthServer(options: HealthServerOptions): http.Server {
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' || !(req.url ?? '/').startsWith('/health')) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
      return;
    }
    void (async () => {
      const database = await prisma
        .$runCommandRaw({ ping: 1 })
        .then(() => 'ok' as const)
        .catch(() => 'down' as const);
      const redis = await options.cache
        .healthy()
        .then((healthy) => (healthy ? ('ok' as const) : ('down' as const)))
        .catch(() => ('down' as const));
      const discord = options.discordReady() ? ('ok' as const) : ('unknown' as const);

      const health: ServiceHealth = {
        status: database === 'down' ? 'down' : database === 'ok' && discord === 'ok' ? 'ok' : 'degraded',
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        version: VERSION,
        checks: { database, redis, discord },
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(health));
    })();
  });

  server.listen(options.port, () => {
    const address = server.address() as AddressInfo;
    log.info({ port: address.port }, 'Health server listening on /health');
  });
  return server;
}

export function stopHealthServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
    // Force-close lingering keep-alive sockets.
    server.closeAllConnections?.();
  });
}
