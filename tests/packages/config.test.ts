import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getEnv,
  isDevelopment,
  isProduction,
  requireEnv,
  resetEnvCache,
  shardCount,
} from '../../packages/config/src/index';

/**
 * The config package caches the parsed environment, so every test mutates
 * process.env and calls resetEnvCache() in a controlled beforeEach/afterEach
 * pair. All schema-relevant keys are cleared first to make tests independent
 * of the developer's real .env file.
 */
const ENV_KEYS = [
  'NODE_ENV',
  'LOG_LEVEL',
  'DATABASE_URL',
  'REDIS_URL',
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DASHBOARD_URL',
  'ADMIN_URL',
  'API_URL',
  'API_PORT',
  'BOT_HEALTH_PORT',
  'ENCRYPTION_KEY',
  'AUTH_SECRET_ADMIN',
  'SHARD_COUNT',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'AI_API_KEY',
  'AI_BASE_URL',
  'AI_MODEL',
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  resetEnvCache();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  saved = {};
  resetEnvCache();
});

describe('getEnv defaults', () => {
  it('applies documented defaults when nothing is set', () => {
    const env = getEnv();
    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.DATABASE_URL).toBe('mongodb://localhost:27017/nexora?replicaSet=rs0');
    expect(env.DASHBOARD_URL).toBe('http://localhost:3000');
    expect(env.ADMIN_URL).toBe('http://localhost:3001');
    expect(env.API_URL).toBe('http://localhost:4000');
    expect(env.API_PORT).toBe(4000);
    expect(env.BOT_HEALTH_PORT).toBe(4001);
    expect(env.SHARD_COUNT).toBe('auto');
  });

  it('treats optional integrations as absent without failing', () => {
    const env = getEnv();
    expect(env.REDIS_URL).toBeUndefined();
    expect(env.DISCORD_TOKEN).toBeUndefined();
    expect(env.AI_API_KEY).toBeUndefined();
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
    expect(env.ENCRYPTION_KEY).toBeUndefined();
  });

  it('accepts NODE_ENV=test (set by test runners)', () => {
    process.env.NODE_ENV = 'test';
    resetEnvCache();
    expect(getEnv().NODE_ENV).toBe('test');
  });

  it('rejects unknown NODE_ENV values with the documented error', () => {
    process.env.NODE_ENV = 'staging';
    expect(() => getEnv()).toThrow(/Invalid environment configuration/);
  });

  it('rejects unknown LOG_LEVEL values', () => {
    process.env.LOG_LEVEL = 'loud';
    expect(() => getEnv()).toThrow(/Invalid environment configuration/);
  });
});

describe('getEnv coercion and validation', () => {
  it('coerces port strings to numbers', () => {
    process.env.API_PORT = '4100';
    process.env.BOT_HEALTH_PORT = '4101';
    const env = getEnv();
    expect(env.API_PORT).toBe(4100);
    expect(env.BOT_HEALTH_PORT).toBe(4101);
  });

  it('rejects non-numeric or non-positive ports', () => {
    process.env.API_PORT = 'not-a-port';
    expect(() => getEnv()).toThrow(/Invalid environment configuration/);
    resetEnvCache();
    process.env.API_PORT = '-1';
    expect(() => getEnv()).toThrow(/Invalid environment configuration/);
  });

  it('passes through valid URLs unchanged', () => {
    process.env.DASHBOARD_URL = 'https://nexora.example.com';
    process.env.REDIS_URL = 'redis://redis:6379';
    const env = getEnv();
    expect(env.DASHBOARD_URL).toBe('https://nexora.example.com');
    expect(env.REDIS_URL).toBe('redis://redis:6379');
  });
});

describe('SHARD_COUNT', () => {
  it('accepts "auto"', () => {
    process.env.SHARD_COUNT = 'auto';
    expect(shardCount()).toBe('auto');
  });

  it('accepts an explicit positive integer as a string', () => {
    process.env.SHARD_COUNT = '4';
    expect(getEnv().SHARD_COUNT).toBe('4');
    expect(shardCount()).toBe(4);
  });

  it('rejects non-numeric values', () => {
    process.env.SHARD_COUNT = 'four';
    expect(() => getEnv()).toThrow(/SHARD_COUNT must be "auto" or a positive integer/);
    resetEnvCache();
    process.env.SHARD_COUNT = '1.5';
    expect(() => getEnv()).toThrow(/SHARD_COUNT must be "auto" or a positive integer/);
  });
});

describe('requireEnv', () => {
  it('returns the value when set', () => {
    process.env.DISCORD_TOKEN = 'a-real-token';
    expect(requireEnv('DISCORD_TOKEN')).toBe('a-real-token');
  });

  it('throws a clear error when the variable is missing', () => {
    expect(() => requireEnv('DISCORD_TOKEN')).toThrow(
      /Missing required environment variable DISCORD_TOKEN/,
    );
  });

  it('treats an empty string as missing', () => {
    process.env.ENCRYPTION_KEY = '';
    expect(() => requireEnv('ENCRYPTION_KEY')).toThrow(
      /Missing required environment variable ENCRYPTION_KEY/,
    );
  });
});

describe('environment caching', () => {
  it('caches the parsed environment until resetEnvCache is called', () => {
    process.env.API_PORT = '4555';
    const first = getEnv();
    expect(first.API_PORT).toBe(4555);

    process.env.API_PORT = '4666';
    const second = getEnv();
    expect(second).toBe(first); // same cached object
    expect(second.API_PORT).toBe(4555); // cache not invalidated yet

    resetEnvCache();
    expect(getEnv().API_PORT).toBe(4666);
  });
});

describe('environment helpers', () => {
  it('isProduction / isDevelopment reflect NODE_ENV', () => {
    process.env.NODE_ENV = 'production';
    expect(isProduction()).toBe(true);
    expect(isDevelopment()).toBe(false);

    resetEnvCache();
    process.env.NODE_ENV = 'development';
    expect(isProduction()).toBe(false);
    expect(isDevelopment()).toBe(true);
  });
});
