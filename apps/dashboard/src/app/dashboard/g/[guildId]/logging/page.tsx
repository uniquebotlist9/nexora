import { prisma } from '@nexora/database';
import { getGuildContext } from '@/lib/guild';
import { loadChannels, parseJsonColumn } from '@/lib/guild-data';
import { PageHeader } from '@/components/shared/page-header';
import { LoggingEditor } from './logging-editor';
import type { LogConfigCategories } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Logging' };

export default async function LoggingPage({ params }: { params: { guildId: string } }) {
  const ctx = await getGuildContext(params.guildId);
  if (!ctx.ok) return null;
  const { guild } = ctx;

  const [config, channels] = await Promise.all([
    prisma.logConfig.findUnique({ where: { guildId: guild.id } }),
    loadChannels(guild.id),
  ]);

  return (
    <div>
      <PageHeader
        title="Logging"
        description="Fine-grained event logging routed to per-category channels."
        breadcrumb={[{ label: guild.name, href: `/dashboard/g/${guild.id}` }, { label: 'Logging' }]}
      />
      <LoggingEditor
        guildId={guild.id}
        initialEnabled={config?.enabled ?? false}
        initialCategories={parseJsonColumn<LogConfigCategories>(config?.categories, {})}
        initialIgnored={config?.ignoredChannelIds ?? []}
        channels={channels}
      />
    </div>
  );
}
