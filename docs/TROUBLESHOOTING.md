# Troubleshooting

Symptom → likely cause → fix. If your issue is not listed here, check the service logs (`npm run dev:api` etc., or `docker compose logs -f <service>`) — every error carries a `requestId` that correlates API errors with logs.

---

## Setup & database

### `Error validating environment variables` at startup
A variable in your environment failed the strict schema in `@nexora/config` — commonly a typo (`DATABASE_ULR` instead of `DATABASE_URL`) or an invalid `LOG_LEVEL`/`NODE_ENV` value. The error message names the offending variable.

### `Environment variable not found: DATABASE_URL` (P1001 / PrismaClientInitializationError)
`.env` is missing or the variable is not loaded. The root `.env` is loaded by the API, bot and admin (via `next.config.mjs`); the **dashboard does not load the root `.env` itself** — export the variables into the environment or use `dotenv`-style injection when running it.

### Cannot connect to MongoDB (P1001: Can't reach database server)
- Verify the port: the default connection string uses `27017`, but **this development machine runs its replica set on `27018`** (`mongodb://localhost:27018/nexora?replicaSet=rs0`). Check your `DATABASE_URL`.
- Under Docker Compose, the host is `mongo` (in-network), not `localhost`.
- Test reachability: `nc -zv localhost 27018` (or `27017`).

### Transactions error: "Transaction API is not supported by this deployment" / "not a replica set"
Prisma transactions require a MongoDB **replica set**, even for a single node. See [GETTING-STARTED](GETTING-STARTED.md#2-mongodb-replica-set) for the `rs.initiate()` steps, then confirm with:

```bash
mongosh --eval "rs.status().myState"   # 1 = PRIMARY
```

### Prisma "Environment variable not found: DATABASE_URL" in tests
Vitest does not load `.env` automatically. The integration tests handle this themselves; if you write new ones, set `process.env.DATABASE_URL` before importing `@nexora/database` (see `tests/integration/database.test.ts`). If MongoDB is not reachable, those tests skip rather than fail.

### `db:push` fails with a replica set error
Same cause as the transactions error above — the `replicaSet=` query parameter must be present in `DATABASE_URL` and the set must be initiated.

---

## Discord

### "Used disallowed intents" on bot startup
The token's privileged intents do not match what the code requests. NEXORA currently only enables the (non-privileged) `Guilds` intent; if you add features that need SERVER MEMBERS or MESSAGE CONTENT intents, enable them in the Developer Portal under *Bot → Privileged Gateway Intents* first. See [DISCORD-SETUP](DISCORD-SETUP.md#3-privileged-gateway-intents).

### Slash commands don't appear
- Guild-scoped commands appear instantly; **global commands can take up to an hour** to propagate.
- Re-run `npm run deploy-commands` (optionally with a guild id for instant testing).
- The bot must be in the guild and the command registration must use the same application (client id) as the bot token.

### OAuth login fails: "Redirect URI mismatch"
The redirect URI sent by next-auth must exactly match one registered in the Developer Portal under *OAuth2 → Redirects*: `http://localhost:3000/api/auth/callback/discord` for the dashboard and `http://localhost:3001/api/auth/callback/discord` for the admin panel (plus your production equivalents). See [DISCORD-SETUP](DISCORD-SETUP.md#2-configure-oauth2-redirects).

### Your guild doesn't show in the dashboard
The dashboard only lists guilds where you have the **Manage Server** permission (Discord's `guilds` OAuth scope) and where the bot is present. Re-authorize if you granted the bot's permissions after inviting it.

### Admin panel login succeeds but access is denied
Admin access requires a row in the `AdminUser` collection for your Discord user id. Seed the first admin (see [GETTING-STARTED](GETTING-STARTED.md)). Also ensure `AUTH_SECRET_ADMIN` is set — the admin panel refuses to start without it.

---

## API

### `401 UNAUTHORIZED` / `401 INVALID_API_KEY`
Missing `Authorization: Bearer nxk_...` header, or the key is malformed, revoked or unknown. Keys are shown only once at creation — if lost, revoke and create a new one via the dashboard.

### `403 INSUFFICIENT_SCOPE`
The key works but lacks the scope the endpoint requires (e.g. `analytics:read` for analytics). Check the key's scopes with `GET /v1/me` and see the scope table in [API](API.md#scopes).

### `403 GUILD_ACCESS_DENIED`
You are not a staff member of that guild (no `GuildMember` row with `isStaff`). `404 GUILD_NOT_FOUND` means the bot isn't in the guild (or has left it).

### `403 PLAN_LIMIT_EXCEEDED`
The guild's plan caps that resource (or the feature is plan-gated). Check the tier table in [CONFIGURATION](CONFIGURATION.md#plan-limits) and the guild overview (`GET /v1/guilds/:guildId`) which returns resolved limits and feature flags.

### `429 RATE_LIMITED`
Global limit is 300 requests/minute per IP; per-key default is 60/minute (per-key value is set at key creation). Respect the `Retry-After` header. Note that per-key limits live in the shared cache — without `REDIS_URL` they reset when the API restarts and are per-instance.

### `503 PAYMENTS_NOT_CONFIGURED`
Stripe variables (`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`) are not set. Payment features are optional.

### `503 INTERNAL_AUTH_NOT_CONFIGURED`
Internal/admin routes were called without `ENCRYPTION_KEY` configured. Set it and restart.

### `401` on internal/admin routes with the header present
The `X-Nexora-Internal` header must be the HMAC-SHA256 of the **UTC date** (`YYYY-MM-DD`) keyed with `ENCRYPTION_KEY`; clock skew beyond ±1 day is rejected. Check the server clock and the exact derivation in [API](API.md#internal-auth-x-nexora-internal-header).

---

## Webhooks

### Deliveries stuck in `PENDING`
The webhook worker runs inside the API process and polls every 10 s — confirm the API is running and check its logs for `webhook worker` errors. Also confirm the endpoint status is `PENDING` or `ACTIVE` (deliveries to `DISABLED` endpoints are skipped).

### Endpoint got disabled
After 5 failed attempts (10 s timeout or non-2xx) the endpoint is disabled automatically. Fix the receiver — it must return 2xx within 10 s — then re-enable the endpoint from the dashboard. See the retry ladder in [API](API.md#retries).

### Receiver rejects the signature
The signature is `sha256=` + HMAC-SHA256 of `${timestamp}.${rawBody}` using the **endpoint secret shown at registration** — verify against the raw bytes, not a re-serialized JSON body. Sample code: [API](API.md#verifying-the-signature-nodejs).

---

## Ports & networking

| Symptom | Cause / fix |
|---|---|
| `EADDRINUSE` on startup | Another process holds the port: API `4000`, dashboard `3000`, admin `3001`, bot health `4001`, MongoDB `27017`/`27018`, Redis `6379`. Free it or set `API_PORT` etc. |
| API behind proxy: everyone shares a rate limit | `trust proxy` is only enabled with `NODE_ENV=production` — set it, and make sure your proxy sends `X-Forwarded-For`. |
| CORS errors from the dashboard | The API only allows origins `DASHBOARD_URL` and `ADMIN_URL` — set them to the exact origins the browser uses (scheme + host + port). |

---

## Still stuck?

- Architecture & data model: [DATABASE](DATABASE.md)
- All configuration values and their effects: [CONFIGURATION](CONFIGURATION.md)
- Endpoint behavior and error codes: [API](API.md)
