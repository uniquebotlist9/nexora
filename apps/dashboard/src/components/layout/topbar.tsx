'use client';

import * as React from 'react';
import { Menu } from 'lucide-react';
import type { DashboardGuildAccess } from '@nexora/types';
import { ServerSelector } from '@/components/layout/server-selector';
import { CommandPalette } from '@/components/layout/command-palette';
import { NotificationsPopover, type NotificationItem } from '@/components/layout/notifications-popover';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { UserMenu } from '@/components/layout/user-menu';

interface TopbarProps {
  guilds: DashboardGuildAccess[];
  currentGuildId: string;
  notifications: NotificationItem[];
  user: { name?: string | null; email?: string | null; image?: string | null };
  onOpenMobileNav: () => void;
}

export function Topbar({ guilds, currentGuildId, notifications, user, onOpenMobileNav }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur-lg sm:px-4">
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
        className="rounded-lg p-2 text-muted-foreground hover:bg-muted focus-ring md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <ServerSelector guilds={guilds} currentGuildId={currentGuildId} />

      <div className="ml-auto flex items-center gap-1">
        <CommandPalette guildId={currentGuildId} />
        <NotificationsPopover items={notifications} />
        <ThemeToggle />
        <UserMenu name={user.name} email={user.email} image={user.image} />
      </div>
    </header>
  );
}
