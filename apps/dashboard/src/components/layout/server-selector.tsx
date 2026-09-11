'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import type { DashboardGuildAccess } from '@nexora/types';
import { DropdownMenu } from '@/components/ui/dropdown';
import { guildIconUrl } from '@/lib/discord';
import { cn } from '@nexora/ui';

function GuildAvatar({ guild, className }: { guild: DashboardGuildAccess; className?: string }) {
  const url = guildIconUrl(guild.guildId, guild.icon);
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#5865F2] to-[#8B5CF6] text-sm font-bold text-white',
        className,
      )}
      aria-hidden="true"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- Discord CDN, tiny fixed size
        <img src={url} alt="" className="h-full w-full rounded-lg object-cover" />
      ) : (
        guild.name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

export function ServerSelector({
  guilds,
  currentGuildId,
}: {
  guilds: DashboardGuildAccess[];
  currentGuildId: string;
}) {
  const router = useRouter();
  const current = guilds.find((g) => g.guildId === currentGuildId);

  return (
    <DropdownMenu
      label="Switch server"
      trigger={
        <span className="flex max-w-[200px] items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm font-medium transition hover:bg-muted sm:max-w-[260px]">
          {current ? (
            <>
              <GuildAvatar guild={current} className="h-6 w-6" />
              <span className="truncate">{current.name}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Select server</span>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </span>
      }
      items={[
        ...guilds.slice(0, 15).map((g) => ({
          label: g.name,
          icon: <GuildAvatar guild={g} className="h-5 w-5" />,
          onSelect: () => router.push(`/dashboard/g/${g.guildId}`),
        })),
        ...(guilds.length > 15
          ? [{ label: `…and ${guilds.length - 15} more`, onSelect: () => router.push('/dashboard'), disabled: true }]
          : []),
        {
          label: 'Add Nexora to another server',
          icon: <Plus className="h-4 w-4 text-primary" />,
          onSelect: () => router.push('/api/invite'),
        },
      ]}
    />
  );
}

/** Server grid used on the /dashboard index page. */
export function ServerGrid({ guilds }: { guilds: DashboardGuildAccess[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {guilds.map((g) => (
        <Link
          key={g.guildId}
          href={`/dashboard/g/${g.guildId}`}
          className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-lg focus-ring"
        >
          <GuildAvatar guild={g} className="h-12 w-12" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold group-hover:text-primary">{g.name}</p>
            <p className="text-xs text-muted-foreground">
              {g.isAdmin ? 'Administrator' : 'Manage Server'}
            </p>
          </div>
          <Check className="h-4 w-4 shrink-0 opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}
