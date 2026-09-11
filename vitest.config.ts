import { defineConfig } from 'vitest/config';

/**
 * Root test configuration.
 *
 * Layout:
 *   tests/packages/*  — unit tests for packages/* (always run; source of truth)
 *   tests/api/*       — HTTP integration tests against apps/api (skip when the
 *                       app is not built yet or no database is reachable)
 *   tests/bot/*       — pure logic tests for bot behaviour that need no
 *                       Discord connection (skipIf-guarded for bot modules)
 *
 * Run with `npx vitest run` (or `npm test`, which rebuilds packages first).
 * Tests import package sources directly from packages/[name]/src so they
 * always exercise the current code, even without a prior build.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 20_000,
    passWithNoTests: false,
  },
});
