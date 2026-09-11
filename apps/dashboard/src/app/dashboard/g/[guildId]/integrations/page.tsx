import { prisma } from '@nexora/database';
import { getGuildContext, getSession } from '@/lib/guild';
import { PageHeader } from '@/components/shared/page-header';
import { IntegrationsView, type WebhookView, type ApiKeyView } from './integrations-view';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Integrations' };

export default async function IntegrationsPage({ params }: { params: { guildId: string } }) {
  const ctx = await getGuildContext(params.guildId);
  if (!ctx.ok) return null;
  const { guild } = ctx;

  const session = await getSession();
  const userId = session?.user?.id;

  const [webhookRows, apiKeyRows] = await Promise.all([
    prisma.webhookEndpoint.findMany({
      where: { guildId: guild.id },
      orderBy: { createdAt: 'desc' },
    }),
    userId
      ? prisma.apiKey.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
      : Promise.resolve([]),
  ]);

  const webhooks: WebhookView[] = webhookRows.map((w) => ({
    id: w.id,
    name: w.name,
    url: w.url,
    events: w.events,
    status: w.status,
    failureCount: w.failureCount,
  }));

  const apiKeys: ApiKeyView[] = apiKeyRows.map((k) => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scopes: k.scopes,
    revoked: k.revokedAt !== null,
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
  }));

  const apiDocsUrl = `${process.env.API_URL?.replace(/\/$/, '') ?? 'https://api.nexora.dev'}/docs`;

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Webhook endpoints, developer API keys and the event catalog."
        breadcrumb={[{ label: guild.name, href: `/dashboard/g/${guild.id}` }, { label: 'Integrations' }]}
      />
      <IntegrationsView
        guildId={guild.id}
        webhooks={webhooks}
        apiKeys={apiKeys}
        apiDocsUrl={apiDocsUrl}
      />
    </div>
  );
}
