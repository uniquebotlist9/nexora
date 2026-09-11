/**
 * Test harness for the API integration tests.
 *
 * apps/api keeps the Express app separate from the bootstrap (index.ts binds
 * API_PORT and starts the webhook worker) precisely so tests can mount the
 * app without side effects. This helper:
 *
 *   1. imports createApp from apps/api/src/app.ts (dev source) or
 *      apps/api/dist/app.js (compiled output) — whichever exists;
 *   2. builds it with an in-memory cache and a silent logger;
 *   3. listens on an ephemeral port (127.0.0.1:0) and returns a fetch-able
 *      base URL.
 *
 * If no entrypoint exists (API app not built yet), the caller receives `null`
 * and skips the HTTP suite with a clear message. If an entrypoint EXISTS but
 * fails to load, the error is rethrown — a broken build should fail the suite,
 * not silently skip it.
 */
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import type { Express } from 'express';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const API_ENTRYPOINTS = [
  { file: path.join(ROOT, 'apps/api/src/app.ts'), specifier: '../../apps/api/src/app' },
  { file: path.join(ROOT, 'apps/api/dist/app.js'), specifier: '../../apps/api/dist/app.js' },
] as const;

export interface ApiHarness {
  /** The built Express app. */
  app: Express;
  /** Base URL of the listening test server, e.g. http://127.0.0.1:39127 */
  baseUrl: string;
  close(): Promise<void>;
}

type CreateApp = (deps: { cache: unknown; logger: unknown }) => Express;

export async function importCreateApp(): Promise<CreateApp | null> {
  for (const entry of API_ENTRYPOINTS) {
    if (!existsSync(entry.file)) continue;
    try {
      const mod = (await import(entry.specifier)) as { createApp?: CreateApp };
      if (typeof mod.createApp !== 'function') {
        throw new Error('module does not export createApp(deps)');
      }
      return mod.createApp;
    } catch (err) {
      throw new Error(
        `Failed to load the API app from ${entry.file} — the app exists but is broken; ` +
          `fix the build instead of skipping these tests. Cause: ${String(err)}`,
      );
    }
  }
  return null;
}

/** Quick TCP probe used to decide whether the test database is reachable. */
export function probeTcp(host: string, port: number, timeoutMs = 2_000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

/**
 * True when the configured database is reachable at TEST_DATABASE_URL
 * (preferred) or DATABASE_URL. Routes that touch the database degrade
 * gracefully when it is absent (e.g. /health reports database: down), so the
 * suite adapts its expectations instead of skipping outright.
 */
export async function databaseReachable(): Promise<boolean> {
  const raw = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return await probeTcp(url.hostname, Number(url.port || 27017));
  } catch {
    return false;
  }
}

/** Boot the app on an ephemeral port (listen(0)) and return a fetch-able harness. */
export async function startApi(): Promise<ApiHarness | null> {
  const createApp = await importCreateApp();
  if (!createApp) return null;

  const { createCache } = await import('../../packages/cache/src/index');
  const { createLogger } = await import('../../packages/logger/src/index');

  // In-memory cache (no Redis dependency) and a silent logger keep the test
  // output clean; the app itself never notices the difference.
  const cache = await createCache(undefined);
  const logger = createLogger('api-test', { level: 'silent' });
  const app = createApp({ cache, logger });

  const server = (await new Promise<Server>((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.once('error', reject);
  })) as Server;

  const address = server.address() as net.AddressInfo;
  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
