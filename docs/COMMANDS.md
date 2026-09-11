# Commands

NEXORA's Discord bot is built on a slash-command framework (`apps/bot/src/framework/`) with a flat registry of every command (`apps/bot/src/commands/registry.ts`). This page documents the command catalog, the execution pipeline, and how to add commands.

> **Note on registration:** the framework and command set live in `apps/bot/src/commands/`, but the registration script (`apps/bot/src/scripts/deploy-commands.ts`) currently registers only **`/ping`** and **`/help`**. Other commands will not appear in Discord until the script is extended to deploy the full registry (see [Registration](#registration) below). The catalog below reflects the commands implemented in the codebase.

All commands are guild-only (they are built with `InteractionContextType.Guild`, so they do not work in DMs).

---

## Catalog

Permissions listed are the Discord permission gate set on the command (`default_member_permissions`); members without it cannot even see the command.

### General (8)

| Command | Description | Permissions |
|---|---|---|
| `/ping` | Check the bot latency and responsiveness | — |
| `/help` | Browse all Nexora commands by category | — |
| `/afk` | Set or clear your AFK status | — |
| `/remind` | Set a personal reminder | — |
| `/serverinfo` | Show information about this server | — |
| `/userinfo` | Show information about a member | — |
| `/avatar` | Show a member's avatar | — |
| `/profile` | Show your (or another member's) Nexora profile | — |

### Moderation (16)

| Command | Description | Permissions |
|---|---|---|
| `/warn` | Warn a member | Moderate Members |
| `/timeout` | Timeout a member | Moderate Members |
| `/mute` | Timeout a member (alias of `/timeout`) | Moderate Members |
| `/unmute` | Remove a timeout from a member | Moderate Members |
| `/kick` | Kick a member | Kick Members |
| `/ban` | Ban a member (optionally temporary) | Ban Members |
| `/unban` | Unban a user | Ban Members |
| `/softban` | Ban a member, remove their recent messages, then unban | Ban Members |
| `/lock` | Lock a channel so members cannot send messages | Manage Channels |
| `/unlock` | Unlock a previously locked channel | Manage Channels |
| `/slowmode` | Set channel slowmode | Manage Channels |
| `/purge` | Bulk delete messages in a channel | Manage Messages |
| `/nick` | Change a member's nickname | Manage Nicknames |
| `/case` | Manage moderation cases | Moderate Members |
| `/modhistory` | Show a member's moderation history | Moderate Members |
| `/appeal` | Appeal a moderation case | — |

Moderation actions integrate with the case system (`/case`, `/modhistory`, `/appeal`), the configurable warn-escalation ladder in guild settings, and the audit log.

### Configuration (8)

| Command | Description | Permissions |
|---|---|---|
| `/settings` | View or change Nexora settings for this server | Manage Server |
| `/config` | Show an overview of every Nexora feature on this server | Manage Server |
| `/welcome` | Configure welcome messages | Manage Server |
| `/farewell` | Configure farewell messages | Manage Server |
| `/autorole` | Manage roles given automatically on join | Manage Roles |
| `/logs` | Configure logging | Manage Server |
| `/automessage` | Manage recurring auto-messages | Manage Server |
| `/sticky` | Manage sticky channel messages | Manage Channels |

### Tickets (1)

| Command | Description | Permissions |
|---|---|---|
| `/tickets` | Configure the ticket system (panels, categories, transcripts) | Manage Server |

### Giveaways (1)

| Command | Description | Permissions |
|---|---|---|
| `/giveaway` | Create and manage giveaways (create, end, reroll, cancel) | Manage Server |

### Social (3)

| Command | Description | Permissions |
|---|---|---|
| `/poll` | Create a reaction poll | — |
| `/suggestion` | Submit or manage suggestions | — |
| `/starboard` | Configure the starboard | Manage Server |

### Leveling (2)

| Command | Description | Permissions |
|---|---|---|
| `/rank` | Show your (or another member's) XP rank | — |
| `/leaderboard` | Show the server leaderboard | — |

### Economy (11)

| Command | Description | Permissions |
|---|---|---|
| `/balance` | Show your wallet and bank balance | — |
| `/bank` | Manage your bank account (deposit/withdraw) | — |
| `/daily` | Claim your daily coins | — |
| `/weekly` | Claim your weekly coins | — |
| `/work` | Work for coins | — |
| `/crime` | Attempt a heist for coins (risky) | — |
| `/rob` | Try to rob another member | — |
| `/pay` | Transfer coins to another member | — |
| `/shop` | Browse or manage the server shop (management subcommands are staff-gated) | — |
| `/buy` | Buy an item from the shop | — |
| `/inventory` | Show purchased shop items | — |

### Roles (1)

| Command | Description | Permissions |
|---|---|---|
| `/roles` | Manage reaction role panels | Manage Roles |

### AutoMod (1)

| Command | Description | Permissions |
|---|---|---|
| `/automod` | Manage AutoMod rules | Manage Server |

### Automations (1)

| Command | Description | Permissions |
|---|---|---|
| `/automation` | List or toggle automations (created on the dashboard) | Manage Server |

### Backups (1)

| Command | Description | Permissions |
|---|---|---|
| `/backup` | Manage server backups (create, restore, verify) | Administrator |

### Utility (2)

| Command | Description | Permissions |
|---|---|---|
| `/embed` | Build and send a custom embed | Manage Messages |
| `/announce` | Send an announcement to a channel | Manage Messages |

---

## Execution pipeline

Every interaction flows through the handler (`apps/bot/src/framework/handler.ts`) in this order:

1. **Command lookup** — the command name is resolved from the registry; unknown commands are ignored.
2. **Disabled check** — commands listed in the guild's `disabledCommands` settings array are rejected.
3. **Cooldown check** — per-member per-command cooldown, defaulting to the guild's `commandCooldownSeconds` setting (default 3 s), overridable per command.
4. **Permission checks** — the member must pass the command's `default_member_permissions`, plus any extra `memberPermissions` bits; the bot itself must hold the command's `botPermissions`.
5. **Execute** — the command's `execute(ctx)` runs with a fully resolved `CommandContext`: interaction, guild, member, guild settings, and a localization function `t(key, vars)` driven by the guild's `language` setting.
6. **Accounting** — command usage increments analytics counters and moderation actions write audit log entries.

Failures at any gate surface to the member as branded embed responses, and errors carry a correlation id from `@nexora/logger`.

## Localization

Responses are looked up through `t(key, vars)` from the i18n module (`apps/bot/src/core/i18n.ts`) with translation files per guild language. Untranslated keys fall back to the default language.

## Registration

Slash commands are registered with Discord's REST API via the deploy script:

```bash
npm run deploy-commands -w @nexora/bot            # global (up to an hour to propagate)
npm run deploy-commands -w @nexora/bot <guildId>  # guild-scoped (instant) — ideal for development
```

> The script currently registers only `/ping` and `/help`. To register the full catalog, extend it to map `allCommands` from `apps/bot/src/commands/registry.ts` (`allCommands.map((c) => c.data.toJSON())`) instead of the inline builder list.

Guild-scoped registration is recommended while iterating: changes appear instantly, while global commands cache for up to an hour.

## Adding a command

1. Create the command in the appropriate category folder (e.g. `apps/bot/src/commands/general/mycommand.ts`):

   ```ts
   import { guildCommand } from '../../framework/builders';
   import type { BotCommand } from '../../framework/types';

   export const myCommand: BotCommand = {
     data: guildCommand('mycommand', 'Do something useful'),
     category: 'general',
     cooldownSeconds: 10,          // optional override
     memberPermissions: [],        // optional extra gates
     botPermissions: [],           // optional
     async execute(ctx) {
       await ctx.interaction.reply('Done');
     },
   };
   ```

2. Export it from the category's `index.ts` (append to the category's `Commands` array).
3. It is automatically picked up by `registry.ts` (`allCommands`) — the registry validates at import time that no two commands share a name.
4. Re-run the deploy script to register it with Discord.

Prefer `guildCommand()` from `framework/builders.ts` over a raw `SlashCommandBuilder` — it enforces the guild-only context. Commands with subcommands (e.g. `/giveaway create`, `/tickets panel`) accept a builder configured with `addSubcommand`.

Command categories are fixed by the `CommandCategory` type (13 values) with display metadata in `categoryMeta` — used by `/help` to render the catalog.
