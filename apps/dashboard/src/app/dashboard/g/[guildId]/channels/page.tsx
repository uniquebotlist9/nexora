import { prisma } from '@nexora/database';
import { Hash } from 'lucide-react';
import { getGuildContext } from '@/lib/guild';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Channels' };

// The bot stores String(channel.type) — numeric ChannelType values.
const TYPE_LABELS: Record<string, { label: string; badge: 'default' | 'secondary' | 'outline' }> = {
  '0': { label: 'Text', badge: 'default' },
  '2': { label: 'Voice', badge: 'secondary' },
  '4': { label: 'Category', badge: 'outline' },
  '5': { label: 'Announcement', badge: 'default' },
  '13': { label: 'Stage', badge: 'secondary' },
  '15': { label: 'Forum', badge: 'default' },
  '16': { label: 'Media', badge: 'default' },
};

export default async function ChannelsPage({ params }: { params: { guildId: string } }) {
  const ctx = await getGuildContext(params.guildId);
  if (!ctx.ok) return null;
  const { guild } = ctx;

  const [channels, logConfigs] = await Promise.all([
    prisma.channel.findMany({ where: { guildId: guild.id }, orderBy: { position: 'asc' } }),
    prisma.logConfig.findUnique({ where: { guildId: guild.id } }),
  ]);

  // Which channels are referenced by logging categories?
  const logCategoryMap = new Map<string, string[]>();
  const categories = (logConfigs?.categories ?? {}) as Record<string, { channelId?: string }>;
  for (const [cat, cfg] of Object.entries(categories)) {
    if (cfg?.channelId) {
      const list = logCategoryMap.get(cfg.channelId) ?? [];
      list.push(cat);
      logCategoryMap.set(cfg.channelId, list);
    }
  }

  return (
    <div>
      <PageHeader
        title="Channels"
        description="Channels synced by the bot, with logging linkage."
        breadcrumb={[{ label: guild.name, href: `/dashboard/g/${guild.id}` }, { label: 'Channels' }]}
      />
      {channels.length === 0 ? (
        <EmptyState
          icon={Hash}
          title="No channels synced yet"
          description="The bot syncs your server's channels on startup — give it a minute and refresh."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border/60">
              {channels.map((c) => {
                const meta = TYPE_LABELS[c.type] ?? { label: c.type, badge: 'outline' as const };
                const linkedCategories = logCategoryMap.get(c.id) ?? [];
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <Hash className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{c.id}</p>
                    </div>
                    <Badge variant={meta.badge}>{meta.label}</Badge>
                    {linkedCategories.length > 0 && (
                      <Badge variant="warning" title={`Logging: ${linkedCategories.join(', ')}`}>
                        logs {linkedCategories.length}
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
