'use client';

import * as React from 'react';
import type { DashboardGuildAccess } from '@nexora/types';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import type { NotificationItem } from '@/components/layout/notifications-popover';

interface DashboardShellProps {
  guildId: string;
  guilds: DashboardGuildAccess[];
  notifications: NotificationItem[];
  user: { name?: string | null; email?: string | null; image?: string | null };
  children: React.ReactNode;
}

export function DashboardShell({ guildId, guilds, notifications, user, children }: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar guildId={guildId} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          guilds={guilds}
          currentGuildId={guildId}
          notifications={notifications}
          user={user}
          onOpenMobileNav={() => setMobileOpen(true)}
        />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
