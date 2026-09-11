# syntax=docker/dockerfile:1
# ==============================================================================
# NEXORA ADMIN (Next.js 14 staff admin panel) — multi-stage build.
#
# Build context is the REPO ROOT:
#
#   docker build -f infra/admin.Dockerfile .
#
# The admin app loads the monorepo root .env via next.config.mjs when one is
# present; inside Docker the environment is provided by compose instead
# (env_file), so no .env is copied into the image.
#
# Same standalone note as infra/dashboard.Dockerfile: no output:'standalone'
# yet, so the runtime keeps node_modules and runs `npm start`.
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
COPY apps/admin ./apps/admin

RUN npm run db:generate \
 && npm run build:packages \
 && npm run build -w @nexora/admin

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
COPY --from=build --chown=node:node /app/apps/admin ./apps/admin

USER node
WORKDIR /app/apps/admin
EXPOSE 3001

# Unauthenticated visitors are redirected to the sign-in page (200).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3001/auth/signin || exit 1

# `next start -p 3001` (package.json start script).
CMD ["npm", "start"]
