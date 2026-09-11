# syntax=docker/dockerfile:1
# ==============================================================================
# NEXORA API (Express + webhook delivery worker) — multi-stage build.
#
# Build context is the REPO ROOT:
#
#   docker build -f infra/api.Dockerfile .
#
# Stage layout is identical to infra/bot.Dockerfile; see the comments there.
# The `build` stage also serves one-shot jobs (schema push):
#   docker build --target build -f infra/api.Dockerfile -t nexora-api-tools .
#   docker run --rm --env-file .env nexora-api-tools \
#     npx prisma db push --schema packages/database/prisma/schema.prisma
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
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN npm run db:generate \
 && npm run build:packages \
 && npm run build -w @nexora/api

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

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/apps/api/package.json /app/apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist

USER node
WORKDIR /app/apps/api
EXPOSE 4000

# GET /health on API_PORT (default 4000). Shell form so the runtime
# environment decides the port.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${API_PORT:-4000}/health" || exit 1

CMD ["node", "dist/index.js"]
