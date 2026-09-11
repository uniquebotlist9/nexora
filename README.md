# NEXORA

**Powerful Automation. Smarter Communities.**

An enterprise Discord bot platform: moderation, tickets, giveaways, leveling, economy, AutoMod, automations, backups and analytics — with a user dashboard, an admin panel, a scoped REST API and signed outgoing webhooks, all in one monorepo.

## Features

- **Moderation** — warns with an escalating punishment ladder, timeouts, bans (including temp/soft bans), channel locks, slowmode, bulk purge, and a full moderation case system with appeals and member history.
- **Automation** — If-this-then-that automation workflows, AutoMod rules, recurring auto-messages, sticky messages and scheduled jobs.
- **Community** — support tickets with panels and transcripts, giveaways, reaction-role panels, polls, suggestions and a starboard.
- **Engagement** — XP leveling with leaderboards and reward roles, a full economy (currency, banking, work/crime/rob, server shop), welcome/farewell messages and autoroles.
- **Infrastructure** — server backups with restore, per-guild settings, extensive logging, localized responses, per-command cooldowns and permission gates.
- **Platform** — Next.js dashboard for server management, an admin panel for platform staff, a scoped REST API with API keys, plan-gated limits across four tiers, and HMAC-signed webhooks with automatic retries.

## Tech stack

| Layer | Technology |
|---|---|
| Bot | Node.js, discord.js v14, sharding manager |
| API | Node.js, Express, Zod, HMAC-authenticated internal routes |
| Dashboard / Admin | Next.js 14, next-auth (Discord OAuth) |
| Database | MongoDB (replica set) via Prisma |
| Cache | Redis (optional, in-memory fallback) |
| Tooling | TypeScript, npm workspaces, Vitest, Docker Compose |

## Quickstart

```bash
# 1. Install dependencies (Node.js >= 20)
npm install

# 2. Start a MongoDB replica set, then configure secrets
cp .env.example .env   # fill in DISCORD_TOKEN, DISCORD_CLIENT_ID, ENCRYPTION_KEY, ...

# 3. Generate the Prisma client and sync the schema
npm run db:generate
npm run db:push

# 4. Build the shared packages
npm run build:packages

# 5. Register slash commands (guild-scoped appears instantly)
npm run deploy-commands -w @nexora/bot YOUR_GUILD_ID

# 6. Start the services
npm run dev:api         # REST API on http://localhost:4000
npm run dev:bot         # Discord gateway client
npm run dev:dashboard   # dashboard on http://localhost:3000
npm run dev:admin       # admin panel on http://localhost:3001
```

Full walkthrough (Discord app setup, replica set on Windows/macOS/Linux, seeding the first admin): **[docs/GETTING-STARTED.md](docs/GETTING-STARTED.md)**.

## Monorepo layout

```
nexora/
├── apps/
│   ├── bot/        # Discord bot (commands, events, framework)
│   ├── api/        # REST API + webhook delivery worker
│   ├── dashboard/  # Next.js user dashboard
│   └── admin/      # Next.js admin panel
├── packages/
│   ├── types/          # shared types, DB value enums, plan limits, webhook events
│   ├── config/         # environment variable schema and loading
│   ├── logger/         # structured logging
│   ├── cache/          # Redis / in-memory cache abstraction
│   ├── permissions/    # Discord permission helpers
│   ├── validation/     # Zod schemas (snowflakes, API payloads)
│   ├── discord/        # embed templates and Discord helpers
│   ├── ui/             # shared dashboard UI components
│   └── database/       # Prisma schema and client (MongoDB)
├── docs/           # documentation (see below)
├── infra/          # Docker Compose stack, Dockerfiles, env template
└── tests/          # Vitest suites (packages, api, bot, integration)
```

## Scripts

Run from the repository root:

| Script | Description |
|---|---|
| `npm run build` | Build everything: shared packages, then all apps |
| `npm run build:packages` | Build only the shared `packages/*` (in dependency order) |
| `npm run typecheck` | Typecheck all workspaces |
| `npm run dev:bot` | Run the bot in dev mode |
| `npm run dev:api` | Run the API in dev mode (port 4000) |
| `npm run dev:dashboard` | Run the dashboard in dev mode (port 3000) |
| `npm run dev:admin` | Run the admin panel in dev mode (port 3001) |
| `npm run db:push` | Sync the Prisma schema to MongoDB (no migrations) |
| `npm run db:generate` | Generate the Prisma client |
| `npm run db:studio` | Open Prisma Studio |
| `npm test` | Build packages, then run the full test suite |
| `npm run test:watch` | Run tests in watch mode |

App-specific scripts (e.g. `npm run deploy-commands -w @nexora/bot` to register slash commands) live in each workspace's `package.json`.

## Documentation

| Document | Contents |
|---|---|
| [GETTING-STARTED](docs/GETTING-STARTED.md) | Prerequisites, MongoDB replica set setup, environment, first run |
| [DATABASE](docs/DATABASE.md) | Prisma + MongoDB: schema management, transactions, model catalog, backups |
| [DISCORD-SETUP](docs/DISCORD-SETUP.md) | Creating the Discord application, OAuth2 redirects, intents, inviting the bot |
| [CONFIGURATION](docs/CONFIGURATION.md) | Every environment variable and the plan-limit tiers |
| [API](docs/API.md) | REST endpoints, authentication, scopes, rate limits, webhook contract |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | Production deployment (Docker Compose or manual), scaling, upgrades |
| [TROUBLESHOOTING](docs/TROUBLESHOOTING.md) | Symptom → cause → fix for common issues |
| [COMMANDS](docs/COMMANDS.md) | Bot command catalog and how to add commands |

Infrastructure for the Docker Compose stack lives in [`infra/`](infra/README.md).

## License

UNLICENSED — proprietary. All rights reserved.
