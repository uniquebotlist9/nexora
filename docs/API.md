# NEXORA REST API

The API service (`apps/api`) exposes a versioned REST API on port `4000` (configurable via `API_PORT`). This document covers authentication, the full endpoint catalog, error handling, rate limits, pagination and the outgoing webhook delivery contract.

- **Base URL (local):** `http://localhost:4000`
- **Health:** `GET /health` (also aliased at `GET /v1/health`) — no authentication

```bash
curl http://localhost:4000/health
```

---

## Authentication

### API keys (`Authorization: Bearer nxk_...`)

Most endpoints under `/v1` authenticate with an API key:

```bash
curl -H "Authorization: Bearer nxk_your-key-here" http://localhost:4000/v1/me
```

- Keys use the `nxk_` prefix followed by 64 hex characters.
- Only a SHA-256 hash of each key is stored; the raw key is shown **exactly once** at creation.
- Keys are created and revoked through the **dashboard** (`/v1/keys` routes below) using your Discord login — deliberately *not* with an API key, so a key can never mint more keys.
- Key creation is plan-gated: FREE `0` keys, PRO `2`, BUSINESS `10`, ENTERPRISE `100`.

#### Scopes

Every key carries one or more scopes. Endpoints declare the scope they require.

| Scope | Grants |
|---|---|
| `guilds:read` | Read guild data, settings, moderation cases, leaderboards, tickets, giveaways, backups |
| `guilds:write` | Mutate settings, automations, custom commands, AutoMod rules, giveaways, tickets, backups |
| `analytics:read` | Read guild analytics and top-command statistics |
| `webhooks:manage` | Create, list, test and delete webhook endpoints, and list deliveries |

### Discord token auth (`/v1/keys`)

The self-service key management routes authenticate with the user's Discord OAuth access token (validated against Discord), obtained by signing in to the dashboard.

### Internal auth (`X-Nexora-Internal`)

The `/v1/internal`, `/v1/scheduled-tasks` and `/v1/admin` routers are for the admin panel and bot backend. They require the `X-Nexora-Internal` header containing `HMAC-SHA256(ENCRYPTION_KEY, <UTC date as YYYY-MM-DD>)` (hex), with a ±1 day skew tolerance. If `ENCRYPTION_KEY` is not configured, these routes return `503 INTERNAL_AUTH_NOT_CONFIGURED`.

### Payment webhooks (`/v1/payments`)

No auth middleware: requests are authenticated by provider-specific HMAC signatures computed over the raw body (e.g. Stripe's `stripe-signature` header). Requires `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`, otherwise `503 PAYMENTS_NOT_CONFIGURED`.

---

## Error format

All errors use a consistent envelope:

```json
{
  "error": {
    "code": "GUILD_NOT_FOUND",
    "message": "Guild not found",
    "requestId": "req_..."
  }
}
```

`requestId` correlates with API logs. Standard error codes:

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body/params/query failed schema validation |
| `INVALID_JSON` | 400 | Request body is not valid JSON |
| `UNAUTHORIZED` | 401 | Missing `Authorization` header |
| `INVALID_API_KEY` | 401 | Unknown, malformed or revoked API key |
| `INSUFFICIENT_SCOPE` | 403 | Key lacks the required scope |
| `FORBIDDEN` | 403 | Authenticated but not allowed (e.g. not staff in the guild) |
| `GUILD_NOT_FOUND` | 404 | Guild id unknown, or the bot is not in it / has left |
| `GUILD_ACCESS_DENIED` | 403 | You are not a staff member of that guild |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Conflict (e.g. revoking an already-revoked key) |
| `PLAN_LIMIT_EXCEEDED` | 403 | Plan limit reached or plan-gated feature disabled |
| `RATE_LIMITED` | 429 | Rate limit exceeded (see below) |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `INTERNAL_AUTH_NOT_CONFIGURED` | 503 | Internal routes called without `ENCRYPTION_KEY` set |
| `PAYMENTS_NOT_CONFIGURED` | 503 | Payment endpoints called without Stripe configured |

Guild access rules: every `/v1/guilds/:guildId` request requires (1) the bot is currently in the guild (`botLeftAt` is null) and (2) the requesting user has a `GuildMember` row with `isStaff` and no `leftAt`. Failing (1) yields `GUILD_NOT_FOUND`; failing (2) yields `GUILD_ACCESS_DENIED`. Invalid guild id format (not a snowflake) yields `400 VALIDATION_ERROR`.

---

## Rate limits

| Limit | Value | Notes |
|---|---|---|
| Global, per IP | 300 requests/minute | Applies to all endpoints |
| Per API key | 60 requests/minute (default) | Configurable per key at creation (1–600) via `rateLimitPerMinute` |

`429 RATE_LIMITED` responses include a `Retry-After` header (seconds). The per-key limiter uses the shared cache, so with Redis configured (`REDIS_URL`) it is enforced across all API instances.

---

## Pagination

List endpoints accept `page` (default `1`) and `pageSize` (default `20`) query parameters and return:

```json
{
  "items": [...],
  "total": 42,
  "page": 1,
  "pageSize": 20
}
```

---

## Endpoints

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | none | Service health (checks database connectivity) |
| GET | `/v1/health` | none | Alias of the above |

### Account

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/v1/me` | API key | Key identity: user, scopes, rate limit, usage |
| GET | `/v1/guilds` | API key | Guilds the key's user can access (paginated) |

### Guild (`/v1/guilds/:guildId`)

| Method | Path | Scope | Description |
|---|---|---|---|
| GET | `/` | `guilds:read` | Guild overview: settings, resolved plan, limits, feature flags |
| GET | `/settings` | `guilds:read` | Guild settings |
| PATCH | `/settings` | `guilds:write` | Update settings (plan-gated fields, e.g. `customBranding`, can return `PLAN_LIMIT_EXCEEDED`) |

#### Moderation

| Method | Path | Scope | Description |
|---|---|---|---|
| GET | `/moderation/cases` | `guilds:read` | List moderation cases (paginated) |
| GET | `/moderation/warnings` | `guilds:read` | List warnings for a user |

#### Analytics

| Method | Path | Scope | Description |
|---|---|---|---|
| GET | `/analytics` | `analytics:read` | Aggregated analytics for a date range |
| GET | `/analytics/top-commands` | `analytics:read` | Most-used commands |

#### Leaderboard, tickets, giveaways

| Method | Path | Scope | Description |
|---|---|---|---|
| GET | `/leaderboard` | `guilds:read` | XP leaderboard |
| GET | `/tickets/config` | `guilds:read` | Ticket configuration |
| PUT | `/tickets/config` | `guilds:write` | Update ticket configuration |
| GET | `/tickets` | `guilds:read` | List tickets (paginated) |
| GET | `/giveaways` | `guilds:read` | List giveaways |
| POST | `/giveaways` | `guilds:write` | Create a giveaway |
| POST | `/giveaways/:id/cancel` | `guilds:write` | Cancel a giveaway |

#### CRUD resource routers (automations, custom commands, AutoMod rules)

All three follow the same shape, plan-limited by tier (see [CONFIGURATION](CONFIGURATION.md#plan-limits)):

| Method | Path | Scope |
|---|---|---|
| GET | `/automations`, `/custom-commands`, `/automod-rules` | `guilds:read` |
| POST | same | `guilds:write` |
| GET | `.../:id` | `guilds:read` |
| PATCH | `.../:id` | `guilds:write` |
| DELETE | `.../:id` | `guilds:write` |

#### Webhooks (`webhooks:manage`)

| Method | Path | Description |
|---|---|---|
| GET | `/webhooks` | List endpoints |
| POST | `/webhooks` | Register an endpoint (URL + selected events; returns the signing secret once) |
| DELETE | `/webhooks/:id` | Remove an endpoint |
| POST | `/webhooks/:id/test` | Send a test event to the endpoint |
| GET | `/webhooks/deliveries` | Delivery history (filterable by status) |

#### Backups

| Method | Path | Scope | Description |
|---|---|---|---|
| GET | `/backups` | `guilds:read` | List stored backups |
| POST | `/backups/:id/verify` | `guilds:write` | Verify a backup's integrity |

#### Leveling, economy, welcome, logging

| Method | Path | Scope | Description |
|---|---|---|---|
| GET / PUT | `/leveling/config` | read / write | Leveling configuration |
| GET / PUT | `/leveling/rewards` | read / write | Level reward roles |
| GET / PUT | `/economy/config` | read / write | Economy configuration |
| GET / POST | `/economy/shop` | read / write | List / create shop items |
| PUT / DELETE | `/economy/shop/:id` | `guilds:write` | Update / delete a shop item |
| GET | `/economy/users/:userId/balance` | `guilds:read` | A member's balance |
| GET / PUT | `/welcome/config` | read / write | Welcome message configuration |
| GET / PUT | `/logging/config` | read / write | Log channel configuration |

### API key management (`/v1/keys`, Discord token auth)

| Method | Path | Description |
|---|---|---|
| GET | `/v1/keys` | List your keys (revoked included by default; `includeRevoked=false` to exclude). Response includes your `plan` and `maxKeys`. |
| POST | `/v1/keys` | Create a key: `{ name, scopes, rateLimitPerMinute? }`. Response contains `keyRaw` **once**. Rate-limited to 20 key actions/minute. |
| DELETE | `/v1/keys/:id` | Revoke a key (soft delete). `409 CONFLICT` if already revoked. |

### Payments

| Method | Path | Description |
|---|---|---|
| POST | `/v1/payments/webhook/:provider` | Provider webhook receiver (HMAC-verified over the raw body) |

### Internal (`X-Nexora-Internal` header)

| Method | Path | Description |
|---|---|---|
| GET | `/v1/internal/stats` | Platform statistics |
| GET | `/v1/internal/guilds/:id` | Full guild dump for the admin panel |
| POST | `/v1/internal/subscriptions` | Upsert a guild's subscription |
| GET | `/v1/scheduled-tasks` | List scheduled tasks |
| POST | `/v1/scheduled-tasks/:id/retry` | Requeue a failed task |
| POST | `/v1/scheduled-tasks/:id/complete` | Mark a task complete |
| GET | `/v1/admin/stats` | Admin dashboard statistics |
| GET | `/v1/admin/guilds` | Admin guild list |
| GET | `/v1/admin/health` | Admin health check |
| GET | `/v1/admin/command-stats` | Command usage statistics |

---

## Outgoing webhooks

When an enabled event occurs in a guild with a registered endpoint, the API worker delivers a `POST` to the endpoint URL with:

**Headers**

| Header | Value |
|---|---|
| `X-Nexora-Event` | Event name (see catalog below) |
| `X-Nexora-Delivery` | Unique delivery id |
| `X-Nexora-Timestamp` | Unix timestamp (seconds) |
| `X-Nexora-Signature` | `sha256=<hex>` — HMAC-SHA256 of `${timestamp}.${rawBody}` using the endpoint's signing secret |
| `Content-Type` | `application/json` |

**Body** — the standard payload envelope:

```json
{
  "id": "delivery id",
  "event": "moderation.ban",
  "guildId": "123456789012345678",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "data": { }
}
```

### Verifying the signature (Node.js)

```js
import crypto from 'node:crypto';

app.post('/webhooks/nexora', express.raw({ type: 'application/json' }), (req, res) => {
  const timestamp = req.header('X-Nexora-Timestamp');
  const signature = req.header('X-Nexora-Signature'); // "sha256=<hex>"

  const expected =
    'sha256=' +
    crypto
      .createHmac('sha256', process.env.NEXORA_WEBHOOK_SECRET)
      .update(`${timestamp}.${req.body.toString()}`)
      .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(401).send('invalid signature');
  }

  // Optionally reject stale timestamps
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    return res.status(401).send('stale timestamp');
  }

  res.status(200).end();
});
```

### Retries

Deliveries that time out (10 s) or return a non-2xx status are retried on a fixed schedule — a maximum of **5 attempts** total:

| Attempt | Delay before this attempt |
|---|---|
| 1 (initial) | — |
| 2 | 1 minute |
| 3 | 5 minutes |
| 4 | 30 minutes |
| 5 | 2 hours |

After the 5th failed attempt the delivery is marked `FAILED` and the endpoint is automatically **disabled** — a persistently unreachable receiver should not generate endless traffic. Re-enable the endpoint from the dashboard after fixing your receiver. Delivery statuses: `PENDING` → `DELIVERING` → `DELIVERED`, or `RETRYING` / `FAILED`. Workers poll every 10 s with concurrency 5; deliveries stuck in `DELIVERING` for more than 5 minutes are reclaimed.

### Event catalog (16 events)

| Group | Events |
|---|---|
| Members | `member.join`, `member.leave` |
| Messages | `message.delete`, `message.edit` |
| Moderation | `moderation.warn`, `moderation.timeout`, `moderation.kick`, `moderation.ban`, `moderation.unban` |
| AutoMod | `automod.triggered` |
| Tickets | `ticket.created`, `ticket.closed` |
| Giveaways | `giveaway.started`, `giveaway.ended` |
| Other | `level.up`, `verification.completed` |

The catalog is defined in `packages/types/src/webhook-events.ts` (`WEBHOOK_EVENTS`).
