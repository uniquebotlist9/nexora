# Getting Started

This guide takes you from a fresh clone to a fully running local NEXORA stack:
MongoDB, REST API, Discord bot, customer dashboard, and admin panel.

> Prefer containers? [infra/README.md](./infra/README.md) describes a one-command
> Docker Compose stack (MongoDB replica set included) that replaces most of the
> manual setup below.

## Prerequisites

| Requirement | Version | Notes |
| --- | --- | --- |
| Node.js | >= 20 (LTS recommended) | `node -v` to check |
| npm | ships with Node | workspaces are used, no other package manager needed |
| MongoDB | 6.0+ (8.x recommended) | **must run as a replica set** — see below |
| Discord application | free | see [DISCORD-SETUP.md](./DISCORD-SETUP.md) |

## 1. Install dependencies

```bash
npm install
```

npm workspaces resolve the shared `@nexora/*` packages automatically.

## 2. MongoDB replica set

NEXORA uses the Prisma MongoDB connector. Two consequences matter for setup:

1. **No migration files.** The schema is applied with `prisma db push`
   (see [DATABASE.md](./DATABASE.md)).
2. **Transactions require a replica set.** Prisma `$transaction` calls fail
   against a standalone `mongod`. You must run MongoDB as a single-node
   replica set even for local development.

### Standard local setup (fresh machine)

**Linux / macOS** — start mongod with the replica set flag:

```bash
mongod --replSet rs0 --dbpath /path/to/data
```

**Windows** — the MongoDB service reads `mongod.cfg`. Replica-set
configuration requires an **elevated (Administrator) shell**:

```powershell
# Run PowerShell as Administrator
& "C:\Program Files\MongoDB\Server\8\bin\mongod.exe" --config "C:\Program Files\MongoDB\Server\8\bin\mongod.cfg" --replSet rs0 --service
```

Or run a user-level instance without touching the service (no admin rights
needed):

```powershell
mongod --replSet rs0 --dbpath C:\Users\<you>\mongodb-rs0\data --port 27018
```

Then, **once per data directory**, initiate the replica set with `mongosh`:

```javascript
// mongosh (connect to the port you started mongod on)
rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] })
// If you used a custom port, use host: "localhost:27018" instead.
// Wait ~10 seconds; rs.status() should show ONE member in PRIMARY state.
```

> [!NOTE]
> **This development machine:** the local replica set runs on **port 27018**
> (user-level `mongod --replSet rs0`, auto-started at login, data at
> `C:\Users\VICTUS\mongodb-rs0\data`). The root `.env` accordingly points at
> `mongodb://localhost:27018/nexora?replicaSet=rs0`. On any other machine,
> the standard port 27017 applies.

## 3. Configure the environment

```bash
cp .env.example .env
```

Fill in the required values (full reference: [CONFIGURATION.md](./CONFIGURATION.md)):

```dotenv
# MongoDB — match the port from step 2 (27017 standard, 27018 on this machine)
DATABASE_URL=mongodb://localhost:27018/nexora?replicaSet=rs0

# Discord app credentials — https://discord.com/developers/applications
DISCORD_TOKEN=your-bot-token-here
DISCORD_CLIENT_ID=your-application-id-here
DISCORD_CLIENT_SECRET=your-client-secret-here

# Secrets — generate each with:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your-32-byte-encryption-key-here
AUTH_SECRET=your-dashboard-auth-secret-here
AUTH_SECRET_ADMIN=your-admin-auth-secret-here   # MUST differ from AUTH_SECRET
```

Never commit the filled-in `.env`.

## 4. Generate the Prisma client and push the schema

```bash
npm run db:generate   # generates @prisma/client from packages/database/prisma/schema.prisma
npm run db:push       # applies the schema to MongoDB (no migration files in this project)
```

Both commands run prisma directly from the repo root with
`--schema packages/database/prisma/schema.prisma`.

## 5. Build the shared packages

```bash
npm run build:packages
```

This compiles all nine `@nexora/*` packages in dependency order — required
before running any app that imports them.

## 6. Register the bot's slash commands

```bash
# Guild-scoped (instant, recommended for development):
npm run deploy-commands -w @nexora/bot 123456789012345678

# Global (takes up to an hour to propagate):
npm run deploy-commands -w @nexora/bot
```

## 7. Start the services

Each service runs in its own terminal (they all hot-reload in dev):

```bash
npm run dev:api        # REST API + webhook delivery worker → http://localhost:4000
npm run dev:bot        # Discord gateway bot
npm run dev:dashboard  # customer dashboard      → http://localhost:3000
npm run dev:admin      # internal admin panel    → http://localhost:3001
```

### 8. Seed the first admin

The admin panel rejects sign-in unless your Discord user ID exists in the
`AdminUser` collection:

```bash
mongosh "mongodb://localhost:27018/nexora?replicaSet=rs0" --eval \
  'db.AdminUser.insertOne({ userId: "YOUR_DISCORD_USER_ID", role: "OWNER" })'
```

Valid roles: `OWNER`, `ADMINISTRATOR`, `DEVELOPER`, `SUPPORT`, `MODERATOR`,
`ANALYST`.

## Verify it works

```bash
curl http://localhost:4000/health
# { "status": "ok", "checks": { "database": "ok", "redis": "disabled", "discord": "unknown" } }
```

- Dashboard: sign in with Discord at http://localhost:3000 — you must have
  the **Manage Server** permission in a guild to configure it.
- Admin: sign in with Discord at http://localhost:3001 (requires the seeded
  `AdminUser` row).
- API usage: create an API key in the dashboard (shown once), then see
  [API.md](./API.md).

## Running the tests

```bash
npm test              # builds packages, then runs the vitest suite
npm run test:watch    # vitest in watch mode
```

Tests never require Discord or external services: the database integration
tests auto-skip when MongoDB is not reachable.

## Where to go next

- [DISCORD-SETUP.md](./DISCORD-SETUP.md) — creating the application, OAuth
  redirects, invite URL, intents
- [DATABASE.md](./DATABASE.md) — schema, db push, transactions, model catalog
- [CONFIGURATION.md](./CONFIGURATION.md) — every environment variable and plan
  limits
- [API.md](./API.md) — REST API, auth, rate limits, webhooks
- [COMMANDS.md](./COMMANDS.md) — slash command catalog
- [DEPLOYMENT.md](./DEPLOYMENT.md) — production deployments
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — symptom → cause → fix
