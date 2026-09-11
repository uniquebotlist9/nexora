import Link from 'next/link';
import { KeyRound, ShieldCheck, Webhook, Gauge, Terminal } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/shared/copy-button';
import { API_KEY_SCOPES } from '@/lib/api-keys';

export const metadata = { title: 'API docs' };
export const dynamic = 'force-dynamic';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface EndpointDoc {
  method: Method;
  path: string;
  scope: string;
  description: string;
}

interface EndpointGroup {
  title: string;
  description?: string;
  endpoints: EndpointDoc[];
}

function methodVariant(method: Method): 'success' | 'default' | 'warning' | 'outline' | 'destructive' {
  switch (method) {
    case 'GET':
      return 'success';
    case 'POST':
      return 'default';
    case 'PUT':
      return 'warning';
    case 'PATCH':
      return 'outline';
    case 'DELETE':
      return 'destructive';
  }
}

const GUILD_NOTE =
  'All guild endpoints are mounted under /v1/guilds/:guildId. The key owner must be staff in that guild.';

const ENDPOINT_GROUPS: EndpointGroup[] = [
  {
    title: 'Health',
    description: 'Public uptime probes — no authentication required.',
    endpoints: [
      { method: 'GET', path: '/health', scope: '—', description: 'Service health and uptime.' },
      { method: 'GET', path: '/v1/health', scope: '—', description: 'Alias of /health.' },
    ],
  },
  {
    title: 'Account',
    description: 'Authenticated with any valid API key.',
    endpoints: [
      {
        method: 'GET',
        path: '/v1/me',
        scope: 'any key',
        description: 'The authenticated key: id, name, prefix, scopes, rate limit and owner.',
      },
      {
        method: 'GET',
        path: '/v1/guilds',
        scope: 'any key',
        description: 'Guilds the key owner can access (with your per-guild access level).',
      },
    ],
  },
  {
    title: 'Guild — overview & settings',
    description: GUILD_NOTE,
    endpoints: [
      { method: 'GET', path: '/v1/guilds/:guildId', scope: 'guilds:read', description: 'Guild overview: member counts, feature configs, recent activity.' },
      { method: 'GET', path: '/v1/guilds/:guildId/settings', scope: 'guilds:read', description: 'Guild settings (prefix, language, escalation ladder, ...).' },
      { method: 'PATCH', path: '/v1/guilds/:guildId/settings', scope: 'guilds:write', description: 'Update guild settings (validated against the shared schemas).' },
    ],
  },
  {
    title: 'Moderation & AutoMod',
    description: GUILD_NOTE,
    endpoints: [
      { method: 'GET', path: '/v1/guilds/:guildId/moderation/cases', scope: 'guilds:read', description: 'Moderation cases with filters and pagination.' },
      { method: 'GET', path: '/v1/guilds/:guildId/moderation/warnings', scope: 'guilds:read', description: 'Warnings issued in the guild.' },
      { method: 'GET', path: '/v1/guilds/:guildId/automod-rules', scope: 'guilds:read', description: 'List AutoMod rules.' },
      { method: 'POST', path: '/v1/guilds/:guildId/automod-rules', scope: 'guilds:write', description: 'Create an AutoMod rule (plan-gated).' },
      { method: 'GET', path: '/v1/guilds/:guildId/automod-rules/:id', scope: 'guilds:read', description: 'Fetch one AutoMod rule.' },
      { method: 'PATCH', path: '/v1/guilds/:guildId/automod-rules/:id', scope: 'guilds:write', description: 'Update an AutoMod rule.' },
      { method: 'DELETE', path: '/v1/guilds/:guildId/automod-rules/:id', scope: 'guilds:write', description: 'Delete an AutoMod rule.' },
    ],
  },
  {
    title: 'Analytics & leaderboards',
    description: GUILD_NOTE,
    endpoints: [
      { method: 'GET', path: '/v1/guilds/:guildId/analytics', scope: 'analytics:read', description: 'Daily analytics (members, joins, messages, voice, ...).' },
      { method: 'GET', path: '/v1/guilds/:guildId/analytics/top-commands', scope: 'analytics:read', description: 'Most used commands.' },
      { method: 'GET', path: '/v1/guilds/:guildId/leaderboard', scope: 'guilds:read', description: 'XP/level leaderboard.' },
    ],
  },
  {
    title: 'Tickets & giveaways',
    description: GUILD_NOTE,
    endpoints: [
      { method: 'GET', path: '/v1/guilds/:guildId/tickets', scope: 'guilds:read', description: 'List tickets.' },
      { method: 'GET', path: '/v1/guilds/:guildId/tickets/config', scope: 'guilds:read', description: 'Ticket panel configuration.' },
      { method: 'PUT', path: '/v1/guilds/:guildId/tickets/config', scope: 'guilds:write', description: 'Update ticket configuration.' },
      { method: 'GET', path: '/v1/guilds/:guildId/giveaways', scope: 'guilds:read', description: 'List giveaways.' },
      { method: 'POST', path: '/v1/guilds/:guildId/giveaways', scope: 'guilds:write', description: 'Create a giveaway (plan-gated).' },
      { method: 'POST', path: '/v1/guilds/:guildId/giveaways/:id/cancel', scope: 'guilds:write', description: 'Cancel a running giveaway.' },
    ],
  },
  {
    title: 'Automations & custom commands',
    description: GUILD_NOTE,
    endpoints: [
      { method: 'GET', path: '/v1/guilds/:guildId/automations', scope: 'guilds:read', description: 'List automations.' },
      { method: 'POST', path: '/v1/guilds/:guildId/automations', scope: 'guilds:write', description: 'Create an automation (plan-gated).' },
      { method: 'GET', path: '/v1/guilds/:guildId/automations/:id', scope: 'guilds:read', description: 'Fetch one automation.' },
      { method: 'PATCH', path: '/v1/guilds/:guildId/automations/:id', scope: 'guilds:write', description: 'Update an automation.' },
      { method: 'DELETE', path: '/v1/guilds/:guildId/automations/:id', scope: 'guilds:write', description: 'Delete an automation.' },
      { method: 'GET', path: '/v1/guilds/:guildId/custom-commands', scope: 'guilds:read', description: 'List custom commands.' },
      { method: 'POST', path: '/v1/guilds/:guildId/custom-commands', scope: 'guilds:write', description: 'Create a custom command (plan-gated).' },
      { method: 'GET', path: '/v1/guilds/:guildId/custom-commands/:id', scope: 'guilds:read', description: 'Fetch one custom command.' },
      { method: 'PATCH', path: '/v1/guilds/:guildId/custom-commands/:id', scope: 'guilds:write', description: 'Update a custom command.' },
      { method: 'DELETE', path: '/v1/guilds/:guildId/custom-commands/:id', scope: 'guilds:write', description: 'Delete a custom command.' },
    ],
  },
  {
    title: 'Feature configs',
    description: `${GUILD_NOTE} Read uses guilds:read, writes use guilds:write.`,
    endpoints: [
      { method: 'GET', path: '/v1/guilds/:guildId/leveling/config', scope: 'guilds:read', description: 'Leveling configuration.' },
      { method: 'PUT', path: '/v1/guilds/:guildId/leveling/config', scope: 'guilds:write', description: 'Update leveling configuration.' },
      { method: 'GET', path: '/v1/guilds/:guildId/leveling/rewards', scope: 'guilds:read', description: 'Level-up role rewards.' },
      { method: 'PUT', path: '/v1/guilds/:guildId/leveling/rewards', scope: 'guilds:write', description: 'Update level-up rewards.' },
      { method: 'GET', path: '/v1/guilds/:guildId/economy/config', scope: 'guilds:read', description: 'Economy configuration.' },
      { method: 'PUT', path: '/v1/guilds/:guildId/economy/config', scope: 'guilds:write', description: 'Update economy configuration.' },
      { method: 'GET', path: '/v1/guilds/:guildId/economy/shop', scope: 'guilds:read', description: 'List shop items.' },
      { method: 'POST', path: '/v1/guilds/:guildId/economy/shop', scope: 'guilds:write', description: 'Create a shop item.' },
      { method: 'PUT', path: '/v1/guilds/:guildId/economy/shop/:id', scope: 'guilds:write', description: 'Update a shop item.' },
      { method: 'DELETE', path: '/v1/guilds/:guildId/economy/shop/:id', scope: 'guilds:write', description: 'Delete a shop item.' },
      { method: 'GET', path: '/v1/guilds/:guildId/economy/users/:userId/balance', scope: 'guilds:read', description: "A member's economy balance." },
      { method: 'GET', path: '/v1/guilds/:guildId/welcome/config', scope: 'guilds:read', description: 'Welcome/verification message configuration.' },
      { method: 'PUT', path: '/v1/guilds/:guildId/welcome/config', scope: 'guilds:write', description: 'Update welcome configuration.' },
      { method: 'GET', path: '/v1/guilds/:guildId/logging/config', scope: 'guilds:read', description: 'Log channel configuration.' },
      { method: 'PUT', path: '/v1/guilds/:guildId/logging/config', scope: 'guilds:write', description: 'Update logging configuration.' },
    ],
  },
  {
    title: 'Webhooks & backups',
    description: `${GUILD_NOTE} Webhook endpoints require the webhooks:manage scope.`,
    endpoints: [
      { method: 'GET', path: '/v1/guilds/:guildId/webhooks', scope: 'webhooks:manage', description: 'List webhook endpoints (secrets never returned).' },
      { method: 'POST', path: '/v1/guilds/:guildId/webhooks', scope: 'webhooks:manage', description: 'Register a webhook endpoint.' },
      { method: 'GET', path: '/v1/guilds/:guildId/webhooks/deliveries', scope: 'webhooks:manage', description: 'Delivery history with retries and status codes.' },
      { method: 'POST', path: '/v1/guilds/:guildId/webhooks/:id/test', scope: 'webhooks:manage', description: 'Send a test event.' },
      { method: 'DELETE', path: '/v1/guilds/:guildId/webhooks/:id', scope: 'webhooks:manage', description: 'Delete a webhook endpoint.' },
      { method: 'GET', path: '/v1/guilds/:guildId/backups', scope: 'guilds:read', description: 'List stored backups.' },
      { method: 'POST', path: '/v1/guilds/:guildId/backups/:id/verify', scope: 'webhooks:manage', description: 'Verify a backup checksum.' },
    ],
  },
  {
    title: 'Key management',
    description:
      'Authenticated with your Discord OAuth token (the same one the dashboard uses) — not with an API key. The dashboard profile page is the primary UI for this.',
    endpoints: [
      { method: 'GET', path: '/v1/keys', scope: 'Discord token', description: 'List your keys (redacted) plus your plan limit.' },
      { method: 'POST', path: '/v1/keys', scope: 'Discord token', description: 'Create a key — the raw key is returned exactly once.' },
      { method: 'DELETE', path: '/v1/keys/:id', scope: 'Discord token', description: 'Revoke a key.' },
    ],
  },
];

const ERROR_CODES_DOC = [
  ['400 VALIDATION_ERROR', 'Request body/query failed schema validation (field details included).'],
  ['401 UNAUTHORIZED / INVALID_API_KEY', 'Missing, malformed, unknown or revoked API key.'],
  ['403 INSUFFICIENT_SCOPE', 'The key lacks the scope required by the endpoint.'],
  ['403 GUILD_ACCESS_DENIED', 'The key owner is not staff in that guild.'],
  ['403 PLAN_LIMIT_EXCEEDED', 'The guild/user plan limit was reached.'],
  ['404 NOT_FOUND / GUILD_NOT_FOUND', 'Unknown resource or guild the bot is not in.'],
  ['409 CONFLICT', 'Duplicate resource or conflicting state.'],
  ['429 RATE_LIMITED', 'Global or per-key rate limit exceeded.'],
  ['500 INTERNAL_ERROR', 'Unexpected server error (quote the requestId when reporting).'],
];

export default function ApiDocsPage() {
  const baseUrl = (process.env.API_URL ?? 'https://api.nexora.dev').replace(/\/$/, '');
  const quickStart = `curl -H "Authorization: Bearer nxk_YOUR_KEY" \\\n  ${baseUrl}/v1/guilds`;

  return (
    <div className="space-y-8">
      <PageHeader
        title="API docs"
        description="Automate Nexora from your own tools. Every endpoint below is live and validated against the same schemas the dashboard uses."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-primary" aria-hidden="true" />
            Quick start
          </CardTitle>
          <CardDescription>
            Create a key on your{' '}
            <Link href="/dashboard/profile" className="text-primary underline-offset-4 hover:underline focus-ring">
              profile page
            </Link>
            , then send it as a bearer token.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3">
            <pre className="min-w-0 flex-1 overflow-x-auto font-mono text-xs leading-relaxed">{quickStart}</pre>
            <CopyButton text={quickStart.replace(/\\\n\s*/g, ' ')} label="Copy" />
          </div>
          <p className="text-sm text-muted-foreground">
            Base URL: <code className="font-mono text-xs">{baseUrl}</code>
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
              Authentication
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Use <code className="font-mono text-xs">Authorization: Bearer nxk_…</code> with a key
              created on your profile. Keys are shown once and stored only as SHA-256 hashes.
            </p>
            <p>
              Guild access mirrors the dashboard: the key owner must be staff (moderator or admin) in
              the guild.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
              Rate limits
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Each key has its own per-minute limit (1–600 req/min, set at creation) plus a global
              limiter for all traffic.
            </p>
            <p>
              Exceeding a limit returns <code className="font-mono text-xs">429 RATE_LIMITED</code>{' '}
              with a Retry-After header.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              Scopes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {API_KEY_SCOPES.map((s) => (
              <div key={s.value} className="text-sm">
                <code className="font-mono text-xs text-primary">{s.label}</code>
                <p className="text-xs text-muted-foreground">{s.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Errors</CardTitle>
          <CardDescription>
            Every error returns{' '}
            <code className="font-mono text-xs">
              {'{ error: { code, message, requestId } }'}
            </code>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {ERROR_CODES_DOC.map(([code, description]) => (
            <div key={code} className="flex flex-col gap-0.5 border-b border-border/60 pb-2 last:border-0 sm:flex-row sm:gap-4">
              <code className="w-64 shrink-0 font-mono text-xs text-primary">{code}</code>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {ENDPOINT_GROUPS.map((group) => (
          <Card key={group.title}>
            <CardHeader>
              <CardTitle className="text-base">{group.title}</CardTitle>
              {group.description && <CardDescription>{group.description}</CardDescription>}
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {group.endpoints.map((e) => (
                  <li key={`${e.method} ${e.path}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-6 py-3">
                    <Badge variant={methodVariant(e.method)} className="w-16 justify-center font-mono">
                      {e.method}
                    </Badge>
                    <code className="break-all font-mono text-xs">{e.path}</code>
                    <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">{e.scope}</span>
                    <p className="w-full text-sm text-muted-foreground sm:w-auto sm:flex-1 sm:pl-[4.75rem]">
                      {e.description}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-primary" aria-hidden="true" />
            Webhooks (outgoing)
          </CardTitle>
          <CardDescription>
            Configure outgoing webhook endpoints per guild from the dashboard&apos;s Integrations
            page — events are signed and retried with backoff; delivery history (status codes,
            latency, payload) is available via the API above.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Payment provider webhooks (<code className="font-mono text-xs">POST /v1/payments/webhook/:provider</code>)
          are signature-verified endpoints for payment providers (e.g. Stripe) — they are not part
          of the public API.
        </CardContent>
      </Card>
    </div>
  );
}
