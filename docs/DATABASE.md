# Database

NEXORA stores everything in **MongoDB** via the Prisma MongoDB connector.

- Schema: [`packages/database/prisma/schema.prisma`](../packages/database/prisma/schema.prisma)
- Client wrapper: [`packages/database/src/index.ts`](../packages/database/src/index.ts)
  (exports a `prisma` singleton plus everything from `@prisma/client`)

## Key facts

| Topic | How it works |
| --- | --- |
| Connector | `provider = "mongodb"` — document database, not relational |
| Migrations | **None.** The schema is applied with `prisma db push` (see below) |
| Transactions | Supported, but **require a replica set** (`$transaction` fails on standalone mongod) |
| ID columns | Discord snowflakes are stored as strings (`@id @map("_id")`); internal models use `cuid()` |
| Value domains | There are no database-level enum types — enumerated values live as plain strings, with the authoritative lists exported by `@nexora/types` (`DB_ENUMS`, e.g. case types, ticket statuses, admin roles) and validated on input by `@nexora/validation` |

## Connection string

```dotenv
DATABASE_URL=mongodb://localhost:27017/nexora?replicaSet=rs0
```

Always include `replicaSet=...` — even for reads it keeps driver behavior
consistent, and transactions require it. On this development machine the
replica set listens on **port 27018** (see
[GETTING-STARTED.md](./GETTING-STARTED.md#2-mongodb-replica-set)).

Setup instructions for a local single-node replica set are in
[GETTING-STARTED.md](./GETTING-STARTED.md); the Docker Compose stack
([infra/](../infra/README.md)) provisions one automatically.

## Schema management

```bash
npm run db:generate   # regenerate @prisma/client after editing schema.prisma
npm run db:push       # apply the schema to the database (create/alter collections + indexes)
npm run db:studio     # browse data with Prisma Studio
```

All commands target `packages/database/prisma/schema.prisma` from the repo
root. Because this project has no migration files:

- `db:push` is **not** diffed against migration history; it computes the
  changes needed to make the database match the schema and applies them.
- Indexes defined with `@@index` / `@@unique` in the schema are created
  automatically by `db:push`.
- `db:push` will warn (and require `--accept-data-loss` for destructive
  changes such as removing a field).

### Workflow for schema changes

1. Edit `packages/database/prisma/schema.prisma`.
2. `npm run db:generate` (client types update immediately).
3. `npm run db:push`.
4. If you added a new enumerated string value, also update `DB_ENUMS` in
   `packages/types/src/db-enums.ts` and the matching zod schema in
   `@nexora/validation` — those two packages are the validation source of
   truth, not the database.

## Transactions

```ts
import { prisma } from '@nexora/database';

await prisma.$transaction(async (tx) => {
  await tx.channel.create({ data: { /* ... */ } });
  await tx.role.create({ data: { /* ... */ } });
  // A throw anywhere rolls back BOTH writes.
});
```

Against MongoDB this requires the replica set. If you see an error like
`Transaction numbers are only allowed on a replica set member or mongos`,
your `DATABASE_URL` points at a standalone mongod — see
[TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

The API uses transactions in a few places that need atomicity across
documents, e.g. webhook delivery bookkeeping (delivery status + endpoint
failure counter) in `apps/api/src/worker/webhooks.ts`.

## Model catalog

The schema is grouped by feature area. Summary of what lives where:

| Group | Models |
| --- | --- |
| Core | `User`, `Guild`, `GuildSettings`, `GuildMember`, `Role`, `Channel` |
| Moderation | `ModerationCase`, `Warning`, `Appeal` |
| Tickets | `TicketConfig`, `Ticket`, `TicketMessage`, `TicketRating` |
| Giveaways | `Giveaway`, `GiveawayEntry` |
| Leveling & economy | `LevelConfig`, `Level`, `EconomyConfig`, `EconomyAccount`, `EconomyTransaction`, `ShopItem` |
| Protection | `AutoModRule`, `AntiRaidConfig`, `VerificationConfig`, `VerificationAttempt` |
| Engagement | `WelcomeConfig`, `LogConfig`, `LogEvent` |
| Automation | `Automation`, `CustomCommand`, `ScheduledTask` |
| Roles & messages | `ReactionRoleMessage`, `StickyMessage` |
| Community | `SuggestionConfig`, `Suggestion`, `StarboardConfig`, `StarboardEntry`, `Birthday`, `Reminder`, `AFKStatus` |
| Backups | `Backup` |
| Developer platform | `WebhookEndpoint`, `WebhookDelivery`, `ApiKey` |
| Billing | `Subscription`, `PaymentEvent` |
| Platform ops | `AuditLog`, `AnalyticsDaily`, `Feedback`, `AdminUser`, `CommandStat` |

### Notable model details

- **`GuildSettings`** — per-guild configuration (prefix, language, timezone,
  embed color, moderation escalation ladder as JSON, disabled commands,
  per-command cooldown). Default escalation ladder: 2 warnings → 1h timeout,
  3 → 7d timeout, 4 → kick, 5 → 30d tempban.
- **`ApiKey`** — dashboard-created API keys. Only `sha256(rawKey)` is stored
  in `keyHash` (unique); the raw key is displayed exactly once at creation.
  `scopes` is a string array (allowed values: `guilds:read`, `guilds:write`,
  `analytics:read`, `webhooks:manage`); `rateLimitPerMinute` defaults to 60.
- **`WebhookEndpoint` / `WebhookDelivery`** — outbound webhook configuration
  and per-delivery attempt tracking. Endpoint secrets are stored encrypted
  (`v1:`-prefixed envelope encryption using `ENCRYPTION_KEY`).
- **`AdminUser`** — platform staff allow-list for the admin panel
  (`userId` = Discord user ID, unique; `role` defaults to `SUPPORT`).
- **`AnalyticsDaily`** — per-guild per-day counters used by the analytics
  endpoints; retention is plan-based (7/90/365/730 days).

## Where enumerated values are defined

Because the MongoDB connector does not support database enum types, the
canonical value lists live in TypeScript:

```ts
// packages/types/src/db-enums.ts
import { DB_ENUMS } from '@nexora/types';

DB_ENUMS.CaseType        // 13 moderation case types
DB_ENUMS.SubscriptionPlan // FREE, PRO, BUSINESS, ENTERPRISE
// ... plus ticket statuses/priorities, giveaway statuses, automod rule and
// action types, automation triggers/actions, admin roles, webhook delivery
// statuses
```

Input validation (zod schemas mirroring these lists) lives in
`@nexora/validation`.

## Backups

- **Guild backups** (moderation cases, settings, roles/channels snapshots) are
  a product feature (`Backup` model, `/v1/guilds/:id/backups` API).
- **Database backups**: use standard MongoDB tooling (`mongodump`/`mongorestore`)
  against your replica set — see [DEPLOYMENT.md](./DEPLOYMENT.md).
