# Deployment

This guide covers building and running NEXORA in production. For local development, see [GETTING-STARTED](GETTING-STARTED.md).

---

## Services

| Service | Port | Description |
|---|---|---|
| API (`apps/api`) | `4000` (`API_PORT`) | Express REST API + webhook delivery worker |
| Bot (`apps/bot`) | — | Discord gateway client (sharded) |
| Dashboard (`apps/dashboard`) | `3000` | Next.js user dashboard |
| Admin (`apps/admin`) | `3001` | Next.js admin panel |
| MongoDB | `27017` | **Replica set required** (transactions) |
| Redis *(optional)* | `6379` | Shared cache: cross-instance rate limits, cooldowns |

The webhook delivery worker runs inside the API process and polls every 10 s. Multiple API instances are safe: deliveries are claimed optimistically (compare-and-swap on status) so no delivery is sent twice.

---

## Option 1: Docker Compose (recommended)

The `infra/` directory contains a full stack: `docker-compose.yml`, per-service Dockerfiles, and `.env.docker.example`.

```bash
cd infra
cp .env.docker.example .env      # fill in real values
docker compose up -d --build    # mongo (replica set auto-initiated) + schema push + services
```

The first boot automatically: starts MongoDB with `--replSet rs0` and initiates the replica set, pushes the Prisma schema (`dbpush` one-shot service), then starts API, bot, dashboard and admin.

Register slash commands once:

```bash
docker compose run --rm bot npm run deploy-commands          # global
docker compose run --rm bot npm run deploy-commands <guildId> # single guild (instant)
```

Full details, optional Redis profile and day-2 operations: see [infra/README.md](../infra/README.md).

## Option 2: Manual / bare metal

Prerequisites: Node.js >= 20, a MongoDB replica set, optionally Redis.

```bash
npm ci
npm run db:generate
npm run db:push
npm run build:packages
npm run build            # builds all apps
```

Run each service with the production environment loaded:

```bash
NODE_ENV=production node apps/api/dist/index.js
NODE_ENV=production node apps/bot/dist/index.js
cd apps/dashboard && npm start   # next start (port 3000)
cd apps/admin && npm start       # next start (port 3001)
```

Use a process manager (systemd units, PM2, Kubernetes) to keep them running. The bot supports sharding via `SHARD_COUNT` (default `auto`).

---

## Environment

Production requires at minimum: `NODE_ENV=production`, `DATABASE_URL` (with `replicaSet=`), `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `ENCRYPTION_KEY`, and the OAuth variables for the panels (`DISCORD_CLIENT_SECRET`, `AUTH_SECRET`, `AUTH_SECRET_ADMIN`). See the complete reference in [CONFIGURATION](CONFIGURATION.md).

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Important production URLs to set correctly (used for CORS, OAuth redirects and server-to-server calls): `API_URL`, `DASHBOARD_URL`, `ADMIN_URL`.

## Reverse proxy

Put the API and panels behind TLS (nginx, Caddy, ingress). The API enables `trust proxy 1` when `NODE_ENV=production` so rate limiting sees the real client IP from `X-Forwarded-For`. Example nginx location for the API:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:4000/;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

For payment webhooks to validate, the proxy must not modify the request body.

## Health checks

| Check | Endpoint |
|---|---|
| API | `GET /health` (verifies database connectivity) |
| Dashboard / Admin | HTTP 200 on `/` |
| Docker Compose | Wired into the compose healthchecks (API + Mongo) |

> The bot exposes no health endpoint yet — `BOT_HEALTH_PORT` (default `4001`) is reserved but unused.

---

## MongoDB in production

- A **replica set is mandatory** (single-node is fine) — Prisma transactions and the webhook worker's atomic claims require it.
- Enable access control and TLS; put MongoDB on a private network (the Docker Compose stack intentionally does not publish the Mongo port).
- Back up with `mongodump` on a schedule; also see the backup/restore notes in [DATABASE](DATABASE.md#backups).

## Scaling notes

| Dimension | Approach |
|---|---|
| Bot | `SHARD_COUNT` (discord.js sharding manager) |
| API | Run multiple instances behind a load balancer; set `REDIS_URL` so per-key rate limits and cooldowns are shared. Webhook delivery is safe across instances (optimistic claiming). |
| Dashboard / Admin | Stateless Next.js apps — scale horizontally behind the load balancer |
| MongoDB | Replica set with secondaries; disk size driven by analytics retention (7–730 days depending on plan tier) |

## Upgrades

```bash
git pull
npm ci
npm run db:generate
npm run db:push        # schema sync — there are no migrations
npm run build
# restart services
```

(Docker Compose: `docker compose up -d --build` re-runs the schema push automatically.)

## Zero-downtime checklist

1. Database schema is additive-first (new optional fields) so old and new code coexist during rollout.
2. Deploy API instances before the bot so new bot code finds compatible endpoints.
3. Webhook deliveries are durable — anything that fails during rollout is retried per the retry ladder (see [API](API.md#retries)).
