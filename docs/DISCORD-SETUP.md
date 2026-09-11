# Discord Setup

Creating and configuring the Discord application that powers the bot, the
dashboard login, and the admin login.

## 1. Create the application

1. Go to <https://discord.com/developers/applications> and click
   **New Application**.
2. Name it (e.g. `NEXORA`) and note the **Application ID** → this is
   `DISCORD_CLIENT_ID`.
3. Under **Bot**:
   - Click **Reset Token** and copy it → this is `DISCORD_TOKEN`. You will
     never see it again; store it in `.env`.
   - Disable **Public Bot** if the bot should only be invitable via your own
     dashboard.
4. Under **OAuth2 → General**: copy the **Client Secret** →
   `DISCORD_CLIENT_SECRET`.

All three values go into `.env`:

```dotenv
DISCORD_TOKEN=your-bot-token-here
DISCORD_CLIENT_ID=your-application-id-here
DISCORD_CLIENT_SECRET=your-client-secret-here
```

## 2. Configure OAuth2 redirects

Under **OAuth2 → Redirects**, add the next-auth callback URLs of both web
apps for every host you run them on:

| App | Redirect URI |
| --- | --- |
| Dashboard | `http://localhost:3000/api/auth/callback/discord` |
| Admin | `http://localhost:3001/api/auth/callback/discord` |

For production, add the equivalents for your real domains
(e.g. `https://dashboard.example.com/api/auth/callback/discord`). The origin
must match `DASHBOARD_URL` / `ADMIN_URL` in `.env` exactly (scheme, host,
port) — Discord rejects mismatches.

OAuth scopes requested by the apps:

- Dashboard: `identify email guilds` (guild list is filtered server-side to
  guilds where you have **Manage Server**).
- Admin: `identify email` (plus an `AdminUser` row in the database — see
  [GETTING-STARTED.md](./GETTING-STARTED.md#8-seed-the-first-admin)).

## 3. Privileged Gateway Intents

Under **Bot → Privileged Gateway Intents**, the current bot build only
requests the standard `Guilds` intent, so **no privileged intents need to be
enabled for the code as it exists today**. As bot features grow (message
automod, welcome messages, leveling from chat), enable:

- **SERVER MEMBERS INTENT** — member join/leave events (anti-raid, welcome)
- **MESSAGE CONTENT INTENT** — message scanning (automod, leveling, AI)

If the bot later subscribes to an intent that is not enabled, Discord closes
the gateway connection with `Used disallowed intents` — see
[TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

## 4. Invite the bot

The dashboard exposes a ready-made invite route that always uses the runtime
`DISCORD_CLIENT_ID`:

```
http://localhost:3000/api/invite
```

The invite URL requests the `bot` + `applications.commands` scopes and a
baseline permission set (view channels, react/send/manage messages, embeds,
attachments, external emoji, kick/ban/timeout members, manage roles and
nicknames, connect/speak). Discord will show the exact list for review
before you authorize.

To invite directly, replace `YOUR_CLIENT_ID`:

```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot+applications.commands&permissions=1374926162951
```

## 5. Register slash commands

```bash
# Guild-scoped — appears instantly, ideal for development:
npm run deploy-commands -w @nexora/bot YOUR_GUILD_ID

# Global — up to an hour to propagate:
npm run deploy-commands -w @nexora/bot
```

The command catalog is defined in `apps/bot` — see
[COMMANDS.md](./COMMANDS.md) for the current list.

## 6. What each credential is used for

| Credential | Used by |
| --- | --- |
| `DISCORD_TOKEN` | Bot process (gateway login, REST calls, command registration) |
| `DISCORD_CLIENT_ID` | Invite URL, slash-command registration, OAuth flows, dashboard `/api/invite` |
| `DISCORD_CLIENT_SECRET` | Dashboard + admin OAuth token exchange (and refresh) |
| `ENCRYPTION_KEY` | Signing admin-to-API internal requests (shared HMAC) and encrypting webhook endpoint secrets at rest |

## Security notes

- Never commit `DISCORD_TOKEN` or `DISCORD_CLIENT_SECRET`. Docs and infra
  templates use placeholders only.
- The bot token grants full control of the application — rotate it
  immediately if leaked (Discord Developer Portal → Bot → Reset Token).
- Use different `AUTH_SECRET` and `AUTH_SECRET_ADMIN` values so dashboard and
  admin sessions are never interchangeable.
