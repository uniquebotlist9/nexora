import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
// @next/env is CommonJS; Node's ESM loader cannot use a named import for it.
import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;

// The admin app lives in an npm-workspaces monorepo; shared secrets live in the
// repo root `.env`. Next.js only auto-loads env files from the app directory,
// so load the monorepo root env here (config is evaluated before build/dev/
// start, in both the compiler and the server process).
const configDir = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(configDir, '../..');
loadEnvConfig(monorepoRoot);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Prisma (and the workspace wrapper) must stay external so the query engine
  // is loaded from node_modules at runtime instead of being bundled.
  serverComponentsExternalPackages: [
    '@nexora/database',
    '@nexora/config',
    '@nexora/logger',
    '@prisma/client',
  ],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
