# Configuration

NEXORA is configured entirely through environment variables (a root `.env` file in development, injected environment in production). This page is the complete reference.

- Copy `.env.example` to `.env` to get started: `cp .env.example .env`
- The schema, defaults and validation live in `packages/config/src/index.ts`.
- Plan limits (premium gating) live in `packages/types/src/plans.ts`.

> **This development machine:** the local MongoDB replica set listens on **port 27018**, so `DATABASE_URL` here is `mongodb://localhost:27018/nexora?replicaSet=rs0`. On a fresh machine use the standard port shown below.

---

## Environment variables

### Core

| Variable | Default | Required | Description |
|---|---|---|---|
| `NODE_ENV` | `development` | no | `development`, `production` or `test`. In production the API trusts one proxy hop (`trust proxy 1`) — set this correctly behind a reverse proxy. |
| `LOG_LEVEL` | `info` | no | Log verbosity. One of `trace`, `debug`, `info`, `warn`, `error`, `fatal`. |
| `DATABASE_URL` | `mongodb://localhost:27017/nexora?replicaSet=rs0` | yes | MongoDB connection string. **Must include `replicaSet=`** — transactions and safe writes require a replica set. |
| `REDIS_URL` | *(empty)* | no | Redis connection string (e.g. `redis://localhost:6379`). If unset, the cache falls back to an in-memory implementation (single process only). Set it whenever you run more than one API instance. |

### Discord bot

| Variable | Default | Required | Description |
|---|---|---|---|
| `DISCORD_TOKEN` | — | yes | Bot token from the Discord Developer Portal. |
| `DISCORD_CLIENT_ID` | — | yes | Application ID from the portal. Used for OAuth and slash-command registration. |
| `DISCORD_CLIENT_SECRET` | — | dashboard/admin login | OAuth2 client secret, used by next-auth for dashboard and admin sign-in. |
| `SHARD_COUNT` | `auto` | no | Number of Discord shards. `auto` lets discord.js calculate it. |

> **Note:** `BOT_HEALTH_PORT` (default `4001`) is reserved for the bot health endpoint but is not currently wired up in `apps/bot`. The API health check is on `GET /health` (port 4000).

### API service

| Variable | Default | Required | Description |
|---|---|---|---|
| `API_PORT` | `4000` | no | Port the REST API listens on. |
| `API_URL` | `http://localhost:4000` | no | Public base URL of the API. Used by the dashboard/admin for server-side calls and for OAuth redirect derivation. |
| `DASHBOARD_URL` | `http://localhost:3000` | no | Public dashboard URL. Used for CORS on the API and OAuth redirect derivation. |
| `ADMIN_URL` | `http://localhost:3001` | no | Public admin panel URL. Same purposes as `DASHBOARD_URL`. |

### Secrets

| Variable | Default | Required | Description |
|---|---|---|---|
| `ENCRYPTION_KEY` | — | yes | 32-byte key (hex or base64) used to encrypt secrets at rest (webhook endpoint secrets) and to sign the internal admin auth header. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `AUTH_SECRET` | — | dashboard login | next-auth secret for the dashboard. Falls back to `NEXTAUTH_SECRET` if set. |
| `AUTH_SECRET_ADMIN` | — | admin login | next-auth secret for the admin panel. Must be set separately from `AUTH_SECRET`. |

### Payments (optional)

| Variable | Default | Required | Description |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | *(empty)* | no | Stripe API key. Without it, payment endpoints return `503 PAYMENTS_NOT_CONFIGURED`. |
| `STRIPE_WEBHOOK_SECRET` | *(empty)* | no | Stripe webhook signing secret for verifying `stripe-signature` headers. |

### AI features (optional)

| Variable | Default | Required | Description |
|---|---|---|---|
| `AI_API_KEY` | *(empty)* | no | API key for the AI provider. |
| `AI_BASE_URL` | *(empty)* | no | Base URL override for an OpenAI-compatible provider. |
| `AI_MODEL` | *(empty)* | no | Model name to use for AI features. |

---

## Where each service reads configuration

| Service | How it loads `.env` |
|---|---|
| API, bot | `@nexora/config` validates `process.env` (dotenv preloaded) |
| Admin panel | Loads the root `.env` itself via `loadEnvConfig` in `apps/admin/next.config.mjs` |
| Dashboard | Relies on the environment already containing the variables — it does **not** load the root `.env` itself (see [TROUBLESHOOTING](TROUBLESHOOTING.md)) |

## Validation rules worth knowing

- Unknown variables are rejected: `@nexora/config` uses a strict schema, so a typo like `DATABASE_ULR` fails fast at startup instead of silently using the default.
- `requireEnv(name)` is used for hard-required values (`DISCORD_TOKEN`, `ENCRYPTION_KEY`, `AUTH_SECRET_ADMIN`, ...) — it throws a clear error naming the missing variable.
- The API's internal admin endpoints require `ENCRYPTION_KEY` (they use it to verify the `X-Nexora-Internal` header) and return `503 INTERNAL_AUTH_NOT_CONFIGURED` when it is absent.

---

## Plan limits

Premium gating is defined in `packages/types/src/plans.ts` (`PLAN_LIMITS`) and resolved per guild from its subscription. These are the effective limits per tier:

| Limit | FREE | PRO | BUSINESS | ENTERPRISE |
|---|---:|---:|---:|---:|
| Automations | 3 | 25 | 100 | 1000 |
| Custom commands | 5 | 50 | 200 | 1000 |
| AutoMod rules | 5 | 25 | 100 | 1000 |
| Stored backups | 1 | 10 | 50 | 500 |
| Giveaways (active) | 3 | 25 | 100 | 1000 |
| Reaction-role messages | 3 | 15 | 50 | 500 |
| Ticket types | 3 | 10 | 25 | 100 |
| Analytics retention (days) | 7 | 90 | 365 | 730 |
| Scheduled jobs | 3 | 25 | 100 | 1000 |
| API keys per user | 0 | 2 | 10 | 100 |
| AI features | — | Yes | Yes | Yes |
| Welcome cards | — | Yes | Yes | Yes |
| Custom branding | — | Yes | Yes | Yes |
| Extended logs | — | Yes | Yes | Yes |
| Economy system | Yes | Yes | Yes | Yes |

Guild plan resolution (`resolveGuildPlan`) and limit lookup (`limitsForPlan`) are exposed on the guild overview endpoint — see [API](API.md#guild-v1guildsguildid).

> Exceeding a plan-gated write (e.g. setting `customBranding` on a FREE guild) returns `403 PLAN_LIMIT_EXCEEDED` from the API.

## Feature flags

Some features are flagged per plan rather than counted (`ai`, `welcomeCards`, `customBranding`, `extendedLogs`, `economy` above). The guild overview response includes a computed `featureFlags` object so clients never have to re-derive gating logic.
