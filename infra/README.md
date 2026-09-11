# NEXORA — Docker Infrastructure

Production-shaped, one-command stack for the whole platform: MongoDB (single-node
replica set), Redis, the REST API, the Discord bot, the customer dashboard and
the internal admin panel.

## What's here

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | Full stack: db (MongoDB replica set `rs0`) + one-shot `db-init` / `db-push`, redis, bot, api, dashboard, admin, and a `deploy-commands` tool |
| `docker-compose.dev.yml` | Local development: only `db` (MongoDB on `localhost:27017`) and `redis` (on `localhost:6379`), matching the root `.env` defaults |
| `bot.Dockerfile` | Multi-stage build of the discord.js bot (Node 20 Alpine, non-root, HEALTHCHECK) |
| `api.Dockerfile` | Multi-stage build of the Express REST API (Node 20 Alpine, non-root, HEALTHCHECK on `/health`) |
| `dashboard.Dockerfile` | Multi-stage build of the Next.js customer dashboard (port 3000) |
| `admin.Dockerfile` | Multi-stage build of the Next.js admin panel (port 3001) |

All Dockerfiles use the **repo root as build context** because every app depends
on the shared `@nexora/*` workspace packages:

```bash
# from the repo root
docker build -f infra/api.Dockerfile .
```

Each image is built in four stages:

1. **deps** — copy every workspace `package.json` + lockfile, `npm ci` (layer-cached across source edits)
2. **build** — generate the Prisma client, build all `@nexora/*` packages, build the app
3. **prod-deps** — `npm ci --omit=dev` (production dependencies only)
4. **runtime** — prod `node_modules` + the generated Prisma client + built packages + the app's `dist`, running as the non-root `node` user with a `HEALTHCHECK`

The `build` stage intentionally keeps dev tooling (Prisma CLI, tsx), so one-shot
jobs can run against it — that is what the `db-push` and `deploy-commands`
compose services do.

## Local development (data services only)

For day-to-day development you run the apps on the host (`npm run dev:bot` etc.)
and only need MongoDB and Redis in Docker — this matches the root `.env`
defaults (`mongodb://localhost:27017/nexora?replicaSet=rs0`, `redis://localhost:6379`):

```bash
# from the repo root
docker compose -f infra/docker-compose.dev.yml up -d db redis
docker compose -f infra/docker-compose.dev.yml down          # keeps data
docker compose -f infra/docker-compose.dev.yml down -v       # deletes data
```

Why the replica set? The platform uses MongoDB transactions (multi-document
`prisma.$transaction` for moderation, ticket and webhook bookkeeping), which
**only work against a replica set** — a standalone `mongod` rejects them. The
dev compose includes a one-shot `db-init` service that runs `rs.initiate()` on
first boot (idempotent on every later start).

## Full stack (self-hosted production shape)

```bash
# 0) prerequisites: root .env filled in (see the root README quick start)
cp .env.example .env   # then set DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET,
                       # ENCRYPTION_KEY, AUTH_SECRET, AUTH_SECRET_ADMIN

# 1) build and start everything (from the repo root)
docker compose --project-directory . -f infra/docker-compose.yml up -d --build

# 2) register the bot's slash commands (global — may take up to 1h to propagate)
docker compose -f infra/docker-compose.yml run --rm deploy-commands
#    ...or instantly for a single guild:
docker compose -f infra/docker-compose.yml run --rm deploy-commands 123456789012345678
```

First boot is automated:

1. `db` starts as a single-node replica set (`rs0`).
2. `db-init` runs `rs.initiate()` (idempotent) and waits until the node is PRIMARY.
3. `db-push` applies the Prisma schema (`prisma db push` — this project uses no
   migration files) and exits.
4. `api`, `bot`, `dashboard` and `admin` start once the schema is in place.

Endpoints after startup:

| Service | URL | Notes |
| --- | --- | --- |
| Dashboard | http://localhost:3000 | Next.js; Discord OAuth sign-in |
| Admin panel | http://localhost:3001 | Next.js; staff-only (see below) |
| REST API | http://localhost:4000 | `GET /health` is public |
| MongoDB | internal only | port not published by default |
| Redis | internal only | used by api + bot for cache, cooldowns, rate limits |

Applying schema changes after editing `packages/database/prisma/schema.prisma`:

```bash
docker compose -f infra/docker-compose.yml up -d --build db-push
```

## Seeding the first admin

The admin panel denies sign-in unless your Discord user ID exists in the
`AdminUser` collection. After the stack is up:

```bash
docker compose -f infra/docker-compose.yml exec db mongosh nexora --eval \
  'db.AdminUser.insertOne({ userId: "YOUR_DISCORD_USER_ID", role: "OWNER" })'
```

Valid roles: `OWNER`, `ADMINISTRATOR`, `DEVELOPER`, `SUPPORT`, `MODERATOR`,
`ANALYST` (see `docs/security.md` for the access matrix).

## Day-2 operations

```bash
docker compose -f infra/docker-compose.yml ps             # status + health
docker compose -f infra/docker-compose.yml logs -f api bot
docker compose -f infra/docker-compose.yml restart api
docker compose -f infra/docker-compose.yml up -d --build api   # rebuild one service
docker compose -f infra/docker-compose.yml down            # stop, keep data volumes
docker compose -f infra/docker-compose.yml down -v         # stop and DELETE all data
```

## Backups (MongoDB)

The data lives in the `mongo_data` volume. Back up with `mongodump` — it
produces consistent, restorable BSON dumps and works against the running
replica set.

Manual backup:

```bash
docker compose -f infra/docker-compose.yml exec db \
  mongodump --db nexora --archive --gzip > backup-nexora-$(date +%Y%m%d-%H%M%S).archive.gz
```

Nightly cron (03:15, keep 14 days) — e.g. `/etc/cron.d/nexora-backup`:

```cron
15 3 * * *  cd /srv/nexora && \
  docker compose -f infra/docker-compose.yml exec -T db \
    mongodump --db nexora --archive --gzip \
    > /var/backups/nexora/nexora-$(date +\%Y\%m\%d).archive.gz && \
  find /var/backups/nexora -name 'nexora-*.archive.gz' -mtime +14 -delete
```

(Redis data is a regenerable cache — no backup needed. If you rely on
persistent rate-limit/cooldown state across restarts, snapshot the
`redis_data` volume with `docker run --rm -v nexora_redis_data:/data -v $PWD:/backup alpine tar czf /backup/redis.tgz /data`.)

Restore into a fresh stack:

```bash
# 1) start only the data layer and let db-init/db-push finish
docker compose --project-directory . -f infra/docker-compose.yml up -d db db-init db-push

# 2) restore the archive (drop the existing database first if it has data)
gunzip -c backup-nexora-20260910-031500.archive.gz | \
  docker compose -f infra/docker-compose.yml exec -T db mongorestore --archive --drop --nsFrom='nexora.*' --nsTo='nexora.*'

# 3) start the apps
docker compose -f infra/docker-compose.yml up -d
```

Test your restores. An untested backup is not a backup.

## Monitoring

Every service exposes a health signal:

| Service | Check | Meaning |
| --- | --- | --- |
| api | `GET :4000/health` | `{ status, uptimeSeconds, version, checks: { database, redis, discord } }` — `database` is a real query round-trip, `discord` is `unknown` (the bot owns that connection), HTTP 503 when the database is down |
| dashboard | `GET :3000/` | public landing page answers 200 |
| admin | `GET :3001/auth/signin` | sign-in page answers 200 |
| bot | container HEALTHCHECK | the bot has no HTTP surface (gateway is outbound-only); liveness = main process alive. A `BOT_HEALTH_PORT` (default 4001) HTTP endpoint is planned — the Dockerfile already documents the wget healthcheck to switch to |
| db | container HEALTHCHECK | `mongosh` ping; replica-set readiness is gated by `db-init` completing |
| redis | container HEALTHCHECK | `redis-cli ping` |

Point your uptime monitor (UptimeRobot, Pingdom, kuma...) at `GET /health` of
the api and at the two web apps; alert on non-200. The api's structured JSON
logs (pino) are ready for shipping to Loki/Datadog/etc.

## Log rotation

Docker's default `json-file` log driver grows unbounded. Cap it in
`/etc/docker/daemon.json` (host-wide):

```json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
```

or per-service in `docker-compose.yml`:

```yaml
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }
```

## Notes and caveats

- **No credentials in the compose file.** All secrets come from the root `.env`
  via `env_file: ../.env`; the app services override `DATABASE_URL`/`REDIS_URL`
  with their in-network equivalents. Never commit the filled-in `.env`.
- **MongoDB runs without authentication** by default and its port is not
  published. Before exposing anything, enable auth
  (`MONGO_INITDB_ROOT_USERNAME`/`PASSWORD` + an auth-enabled `DATABASE_URL`
  with `&authSource=admin`) and front the web apps with a TLS proxy.
- **Dashboard/admin images are not "standalone".** Neither Next.js app sets
  `output: 'standalone'`, so their runtime stages keep `node_modules` and run
  `npm start` instead of the minimal `server.js` mode. Switching
  `output: 'standalone'` in both `next.config.mjs` files would shrink the
  images considerably.
- **The bot image does not run deploy-commands at boot.** Command registration
  is an explicit action (`deploy-commands` service) so restarts never clobber
  a carefully curated command set.
- Images use Node 20 Alpine to match the repo's `engines` requirement; the
  Prisma client is generated inside the image so the bundled engine binary
  always matches the runtime (musl).
