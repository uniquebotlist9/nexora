import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// npm workspace scripts run with cwd = the workspace dir (apps/*, packages/*),
// while the single configured .env lives at the monorepo root. dotenv skips
// files that do not exist and never overrides variables already set, so all
// candidates can be loaded unconditionally; a local .env still wins over the
// root one because it is loaded first.
for (const candidate of ['.env', '../.env', '../../.env', '../../../.env']) {
  loadDotenv({ path: candidate });
}

/**
 * Central environment configuration, validated once at process start.
 * Optional integrations (payments, AI, Redis) degrade gracefully when unset;
 * required credentials are enforced via requireEnv() at the point of use so
 * that e.g. the API can boot without a Discord token.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),

  // Database (MongoDB; requires a replica set for transactions)
  DATABASE_URL: z
    .string()
    .default('mongodb://localhost:27017/nexora?replicaSet=rs0'),

  // Redis (optional)
  REDIS_URL: z.string().optional(),

  // Discord
  DISCORD_TOKEN: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),

  // URLs / ports
  DASHBOARD_URL: z.string().default('http://localhost:3000'),
  ADMIN_URL: z.string().default('http://localhost:3001'),
  API_URL: z.string().default('http://localhost:4000'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  BOT_HEALTH_PORT: z.coerce.number().int().positive().default(4001),

  // Secrets
  ENCRYPTION_KEY: z.string().optional(),

  // Staff admin console (next-auth) — must differ from the dashboard's secret
  AUTH_SECRET_ADMIN: z.string().optional(),

  // Sharding
  SHARD_COUNT: z
    .string()
    .default('auto')
    .refine((v) => v === 'auto' || /^\d+$/.test(v), {
      message: 'SHARD_COUNT must be "auto" or a positive integer',
    }),

  // Optional integrations
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().optional(),
  AI_MODEL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(
        `Invalid environment configuration:\n${issues}\n\nCheck your .env file against .env.example`,
      );
    }
    cached = parsed.data;
  }
  return cached;
}

/** Reset cached env (tests). */
export function resetEnvCache(): void {
  cached = null;
}

/**
 * Fetch a required credential or throw a clear, actionable error.
 * Use for values that are only required by a subset of services
 * (e.g. DISCORD_TOKEN for the bot, AUTH secrets for the dashboard).
 */
export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = getEnv()[key];
  if (value === undefined || value === null || value === '') {
    throw new Error(
      `Missing required environment variable ${String(key)}. ` +
        `Set it in your .env file (see .env.example).`,
    );
  }
  return value as NonNullable<Env[K]>;
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === 'production';
}

export function isDevelopment(): boolean {
  return getEnv().NODE_ENV === 'development';
}

/** Resolve the effective shard count. `null` = let discord.js decide. */
export function shardCount(): number | 'auto' {
  const value = getEnv().SHARD_COUNT;
  return value === 'auto' ? 'auto' : Number.parseInt(value, 10);
}
