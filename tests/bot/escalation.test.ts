import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { escalationConfigSchema } from '../../packages/validation/src/index';

/**
 * Escalation engine tests.
 *
 * apps/bot may not be built yet, so these tests pin the escalation CONTRACT
 * instead of importing bot code:
 *
 *   1. The default escalation ladder is read straight from the Prisma schema
 *      (GuildSettings.escalating @default) and asserted against the documented
 *      ladder: 2 warnings → timeout 1h, 3 → timeout 7d, 4 → kick, 5 → tempban 30d.
 *   2. The same JSON must validate against escalationConfigSchema, so the DB
 *      default and the API/dashboard input contract can never drift apart.
 *   3. If apps/bot/src/services/moderation.ts ever exports computeEscalation,
 *      the last block cross-checks it against the reference implementation here.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCHEMA_PATH = path.join(ROOT, 'packages/database/prisma/schema.prisma');
const BOT_MODERATION_SRC = path.join(ROOT, 'apps/bot/src/services/moderation.ts');
const BOT_MODERATION_DIST = path.join(ROOT, 'apps/bot/src/services/moderation.js');

interface EscalationStep {
  warnings: number;
  action: 'timeout' | 'kick' | 'tempban' | 'ban';
  durationMinutes?: number;
}

interface EscalationConfig {
  steps: EscalationStep[];
  resetOnEscalate: boolean;
}

/** Extract the raw JSON default of GuildSettings.escalating from schema.prisma. */
function loadDefaultEscalation(): EscalationConfig {
  const raw = readFileSync(SCHEMA_PATH, 'utf8');
  const match = raw.match(/escalating\s+Json\?\s+@default\("((?:[^"\\]|\\.)*)"\)/);
  if (!match) {
    throw new Error('Could not find the `escalating Json? @default(...)` column in schema.prisma');
  }
  const json = match[1].replace(/\\"/g, '"');
  return JSON.parse(json) as EscalationConfig;
}

/**
 * Reference implementation of the escalation semantics: the highest step whose
 * warning threshold has been reached (or exceeded) wins.
 */
function resolveEscalation(
  activeWarnings: number,
  config: Pick<EscalationConfig, 'steps'>,
): EscalationStep | null {
  const sorted = [...config.steps].sort((a, b) => a.warnings - b.warnings);
  let matched: EscalationStep | null = null;
  for (const step of sorted) {
    if (activeWarnings >= step.warnings) matched = step;
  }
  return matched;
}

const defaultConfig = loadDefaultEscalation();

describe('default escalation ladder (schema.prisma contract)', () => {
  it('parses as valid JSON with the documented shape', () => {
    expect(Array.isArray(defaultConfig.steps)).toBe(true);
    expect(defaultConfig.resetOnEscalate).toBe(true);
  });

  it('is exactly the documented ladder: 2→timeout 1h, 3→timeout 7d, 4→kick, 5→tempban 30d', () => {
    expect(defaultConfig.steps).toEqual([
      { warnings: 2, action: 'timeout', durationMinutes: 60 }, // 1 hour
      { warnings: 3, action: 'timeout', durationMinutes: 10080 }, // 7 days
      { warnings: 4, action: 'kick' }, // no duration
      { warnings: 5, action: 'tempban', durationMinutes: 43200 }, // 30 days
    ]);
  });

  it('validates against escalationConfigSchema (DB default ↔ API contract)', () => {
    const parsed = escalationConfigSchema.safeParse(defaultConfig);
    expect(parsed.success).toBe(true);
  });

  it('resolves warning counts to the documented actions', () => {
    expect(resolveEscalation(0, defaultConfig)).toBeNull(); // no warnings yet
    expect(resolveEscalation(1, defaultConfig)).toBeNull(); // below the first step
    expect(resolveEscalation(2, defaultConfig)).toEqual({
      warnings: 2,
      action: 'timeout',
      durationMinutes: 60,
    });
    expect(resolveEscalation(3, defaultConfig)).toEqual({
      warnings: 3,
      action: 'timeout',
      durationMinutes: 10080,
    });
    expect(resolveEscalation(4, defaultConfig)).toEqual({ warnings: 4, action: 'kick' });
    expect(resolveEscalation(5, defaultConfig)).toEqual({
      warnings: 5,
      action: 'tempban',
      durationMinutes: 43200,
    });
    // Beyond the last step, the strictest configured action keeps applying.
    expect(resolveEscalation(9, defaultConfig)?.action).toBe('tempban');
  });

  it('supports custom ladders (dashboard-configurable per guild)', () => {
    const custom: EscalationConfig = {
      steps: [{ warnings: 3, action: 'ban' }],
      resetOnEscalate: false,
    };
    expect(resolveEscalation(2, custom)).toBeNull();
    expect(resolveEscalation(3, custom)).toEqual({ warnings: 3, action: 'ban' });
  });
});

// --- Optional cross-check against the real bot implementation ----------------
// apps/bot/src/services/moderation.ts implements the escalation engine
// (runEscalationIfDue) against GuildSettings.escalating. The function itself
// is not exported, so this block asserts the module's exported contract
// constants and — once a pure computeEscalation helper is exported —
// cross-checks it against the reference implementation above. If the module
// exists but fails to import, the error is rethrown so a broken bot build
// fails loudly instead of skipping silently.
const botModerationPath = existsSync(BOT_MODERATION_SRC)
  ? BOT_MODERATION_SRC
  : existsSync(BOT_MODERATION_DIST)
    ? BOT_MODERATION_DIST
    : null;

let botModeration: Record<string, unknown> | null = null;
if (botModerationPath) {
  try {
    botModeration = (await import('../../apps/bot/src/services/moderation')) as Record<
      string,
      unknown
    >;
  } catch (err) {
    throw new Error(
      `Failed to load apps/bot/src/services/moderation (exists but broken): ${String(err)}`,
    );
  }
} else {
  console.warn(
    '[tests/bot] apps/bot/src/services/moderation.ts not found yet — ' +
      'computeEscalation cross-check tests are skipped; the schema-default contract tests above still run.',
  );
}

const computeEscalation =
  typeof botModeration?.computeEscalation === 'function'
    ? (botModeration.computeEscalation as (...args: unknown[]) => unknown)
    : null;

describe.skipIf(!botModerationPath)('apps/bot/src/services/moderation contract', () => {
  it('exports the Discord timeout ceiling (28 days)', () => {
    // MAX_TIMEOUT_MINUTES is the hard Discord cap used to clamp durations.
    expect(botModeration?.MAX_TIMEOUT_MINUTES).toBe(40_320);
  });

  it.skipIf(!computeEscalation)('computeEscalation matches the schema default ladder', () => {
    expect(computeEscalation!(1, defaultConfig)).toBeNull();
    expect(computeEscalation!(2, defaultConfig)).toMatchObject({
      action: 'timeout',
      durationMinutes: 60,
    });
    expect(computeEscalation!(4, defaultConfig)).toMatchObject({ action: 'kick' });
    expect(computeEscalation!(5, defaultConfig)).toMatchObject({
      action: 'tempban',
      durationMinutes: 43200,
    });
  });
});
