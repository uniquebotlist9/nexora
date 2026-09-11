# syntax=docker/dockerfile:1
# ==============================================================================
# NEXORA DASHBOARD (Next.js 14 customer dashboard) — multi-stage build.
#
# Build context is the REPO ROOT:
#
#   docker build -f infra/dashboard.Dockerfile .
#
# NOTE: apps/dashboard does not set `output: 'standalone'` in next.config.mjs,
# so the runtime cannot use Next's minimal server.js mode and keeps
# node_modules + .next instead. For slimmer images, set output:'standalone'
# in apps/dashboard/next.config.mjs and copy .next/standalone +
# .next/static in the runtime stage.
# ==============================================================================

FROM node:20-alpine AS deps
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

RUN npm ci --workspaces --include-workspace-root

# ------------------------------------------------------------------------------
FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/dashboard ./apps/dashboard

# Prisma client first (server components import @nexora/database at build).
RUN npm run db:generate \
 && npm run build:packages \
 && npm run build -w @nexora/dashboard

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
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/packages ./packages
# .next contains the production build; node_modules is needed by `next start`
# until the app switches to output: 'standalone'.
COPY --from=build --chown=node:node /app/apps/dashboard ./apps/dashboard

USER node
WORKDIR /app/apps/dashboard
EXPOSE 3000

# The public landing page answers 200 without a session.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1

# `next start -p 3000` (package.json start script).
CMD ["npm", "start"]
