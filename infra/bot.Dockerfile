# syntax=docker/dockerfile:1
# ==============================================================================
# NEXORA BOT (discord.js v14, Node) — multi-stage build.
#
# Build context is the REPO ROOT (the bot depends on the shared @nexora/*
# workspace packages):
#
#   docker build -f infra/bot.Dockerfile .
#
# Stages:
#   deps       — install ALL workspace dependencies (manifests only → the
#                expensive `npm ci` layer stays cached across source edits)
#   build      — generate the Prisma client, build all @nexora/* packages,
#                then build the bot
#   prod-deps  — production-only dependency install (no devDependencies)
#   runtime    — minimal image: prod node_modules + generated Prisma client +
#                built packages + the app, non-root `node` user
#
# One-shot jobs (e.g. slash-command registration) run against the `build`
# stage, which retains tsx and the Prisma CLI:
#   docker build --target build -f infra/bot.Dockerfile -t nexora-bot-tools .
#   docker run --rm --env-file .env nexora-bot-tools \
#     npm run deploy-commands -w @nexora/bot [guildId]
# ==============================================================================

FROM node:20-alpine AS deps
# openssl + libc6-compat: Prisma engine requirements on Alpine (musl).
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# Workspace manifests first (root + every workspace) so `npm ci` is cached.
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/bot/package.json apps/bot/
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/admin/package.json apps/admin/
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
COPY packages/logger/package.json packages/logger/
COPY packages/cache/package.json packages/cache/
COPY packages/permissions/package.json packages/permissions/
COPY packages/validation/package.json packages/validation/
COPY packages/discord/package.json packages/discord/
COPY packages/ui/package.json packages/ui/
COPY packages/database/package.json packages/database/

RUN npm ci --workspaces --include-workspace-root

# ------------------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/bot ./apps/bot

# The Prisma client must be generated before @nexora/database (and everything
# importing it) can compile. Generates into node_modules/.prisma/client.
RUN npm run db:generate \
 && npm run build:packages \
 && npm run build -w @nexora/bot

# ------------------------------------------------------------------------------
FROM node:20-alpine AS prod-deps
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/bot/package.json apps/bot/
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/admin/package.json apps/admin/
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
COPY packages/logger/package.json packages/logger/
COPY packages/cache/package.json packages/cache/
COPY packages/permissions/package.json packages/permissions/
COPY packages/validation/package.json packages/validation/
COPY packages/discord/package.json packages/discord/
COPY packages/ui/package.json packages/ui/
COPY packages/database/package.json packages/database/

RUN npm ci --omit=dev --workspaces --include-workspace-root

# ------------------------------------------------------------------------------
FROM node:20-alpine AS runtime
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app

# node_modules contains the workspace symlinks (@nexora/* -> ../../packages/*),
# so packages/ must be copied alongside it for the links to resolve.
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
# Generated Prisma client (with the musl engine binary) from the build stage.
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/apps/bot/package.json /app/apps/bot/package.json
COPY --from=build --chown=node:node /app/apps/bot/dist ./apps/bot/dist

USER node
WORKDIR /app/apps/bot

# The Discord gateway connection is outbound-only — no ports are published.
# BOT_HEALTH_PORT (default 4001) is reserved for a future /health endpoint;
# once it lands, replace this with:
#   HEALTHCHECK CMD wget -q -O /dev/null http://127.0.0.1:4001/health || exit 1
# Until then, liveness = the main process (PID 1) still exists.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD kill -0 1 || exit 1

CMD ["node", "dist/index.js"]
