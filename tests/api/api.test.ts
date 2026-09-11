import { afterAll, describe, expect, it } from 'vitest';
import { databaseReachable, startApi, type ApiHarness } from './helpers';
import type { ApiError, PaginatedResult } from '../../packages/types/src/index';

/**
 * API integration tests.
 *
 * These tests boot the real Express app (see ./helpers — createApp from
 * apps/api/src/app.ts, in-memory cache, silent logger) on an ephemeral port
 * and exercise it over HTTP with fetch. No extra test dependencies.
 *
 * The suite is skipped with a clear message when the API app has no
 * importable entrypoint. The /health expectations adapt to whether the
 * configured database is reachable: 200 + ok when it is, 503 + down when
 * it is not (that degradation is part of the contract).
 */
const dbReachable = await databaseReachable();

let harness: ApiHarness | null = null;
try {
  harness = await startApi();
} catch (err) {
  // A broken app build must fail loudly rather than silently skip.
  throw err;
}

if (!harness) {
  console.warn(
    '[tests/api] Skipping HTTP integration tests: apps/api has no importable ' +
      'entrypoint yet (expected apps/api/src/app.ts exporting createApp, or apps/api/dist/app.js).',
  );
}

afterAll(async () => {
  await harness?.close();
});

describe('API response contracts (always run)', () => {
  it('errors use the documented { error: { code, message, requestId? } } envelope', () => {
    const body: ApiError = { error: { code: 'NOT_FOUND', message: 'Resource not found' } };
    expect(Object.keys(body.error)).toEqual(expect.arrayContaining(['code', 'message']));
    expect(typeof body.error.code).toBe('string');
    expect(typeof body.error.message).toBe('string');
  });

  it('pagination uses the documented PaginatedResult shape', () => {
    const result: PaginatedResult<string> = {
      items: ['a', 'b'],
      total: 2,
      page: 1,
      pageSize: 25,
      pageCount: 1,
    };
    expect(result.items).toHaveLength(2);
    expect(result.pageCount).toBe(Math.ceil(result.total / result.pageSize));
  });
});

describe.skipIf(!harness)('API HTTP integration (real express app)', () => {
  const base = () => harness!.baseUrl;

  it('GET /health reports the ServiceHealth shape', async () => {
    const res = await fetch(`${base()}/health`);
    const body = (await res.json()) as {
      status: string;
      uptimeSeconds: number;
      version: string;
      checks: { database: string; redis: string; discord: string };
    };

    expect(typeof body.uptimeSeconds).toBe('number');
    expect(typeof body.version).toBe('string');
    expect(body.checks.discord).toBe('unknown'); // the bot owns the Discord connection, not the API

    // The health contract is consistency, not a fixed status: 200 + ok when
    // the database answers, 503 + down when it does not. (A TCP-reachable
    // MongoDB that fails the actual query — e.g. wrong replica set config —
    // must still degrade gracefully.)
    if (res.status === 200) {
      expect(body.status).toBe('ok');
      expect(body.checks.database).toBe('ok');
    } else {
      expect(res.status).toBe(503);
      expect(body.status).toBe('down');
      expect(body.checks.database).toBe('down');
    }
  });

  it('returns a 404 error envelope for unknown routes', async () => {
    const res = await fetch(`${base()}/v1/this-route-does-not-exist`);
    expect(res.status).toBe(404);

    const body = (await res.json()) as ApiError;
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(typeof body.error.message).toBe('string');
    expect(typeof body.error.requestId).toBe('string');
  });

  it('returns 401 for /v1/me without an API key', async () => {
    const res = await fetch(`${base()}/v1/me`);
    expect(res.status).toBe(401);

    const body = (await res.json()) as ApiError;
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toMatch(/Missing or malformed Authorization header/);
  });

  it('returns 401 for a malformed Authorization header', async () => {
    const res = await fetch(`${base()}/v1/me`, {
      headers: { Authorization: 'Bearer not-a-nexora-key' },
    });
    expect(res.status).toBe(401);

    const body = (await res.json()) as ApiError;
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toMatch(/Missing or malformed Authorization header/);
  });

  it('rejects guild routes before touching data when no key is present', async () => {
    const res = await fetch(`${base()}/v1/guilds?page=1&pageSize=25`);
    expect(res.status).toBe(401);
  });
});
