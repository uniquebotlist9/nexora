import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
// @next/env is CommonJS; Node's ESM loader cannot use a named import for it.
import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;

// The dashboard lives in an npm-workspaces monorepo; shared secrets live in
// the repo root `.env`. Next.js only auto-loads env files from the app
// directory, so load the monorepo root env here. This covers the CLI/build
// process — the forked dev server child does NOT inherit these mutations
// (next-dev snapshots the environment before the config runs), which is why
// src/instrumentation.ts re-imports @nexora/config at server boot.
const configDir = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(configDir, '../..');
loadEnvConfig(monorepoRoot);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // instrumentation.ts runs once at server boot (inside the dev-server child
  // and in production) to load the monorepo root .env into process.env.
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
