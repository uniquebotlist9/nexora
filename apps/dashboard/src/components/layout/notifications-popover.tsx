'use client';

import * as React from 'react';
import { Bell, History } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { DropdownMenu } from '@/components/ui/dropdown';
import { EmptyState } from '@/components/shared/empty-state';

export interface NotificationItem {
  id: string;
  action: string;
  actorType: string;
  createdAt: string;
}

/**
 * Popover showing recent AuditLog entries for the guild (activity feed of
 * dashboard changes). Data is fetched by the shell and passed serialized.
 */
export function NotificationsPopover({ items }: { items: NotificationItem[] }) {
  const hasUnread = items.length > 0;

  return (
    <DropdownMenu
      label="Notifications"
      trigger={
        <span className="relative inline-flex rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground">
          <Bell className="h-4 w-4" aria-hidden="true" />
          {hasUnread && (
            <span
              className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary"
              aria-hidden="true"
            />
          )}
        </span>
      }
      items={
        items.length === 0
          ? [{ label: 'No recent activity', onSelect: () => {}, disabled: true }]
          : items.slice(0, 8).map((n) => ({
              label: `${n.action} · ${formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}`,
              icon: <History className="h-4 w-4 text-muted-foreground" />,
              onSelect: () => {},
            }))
      }
    />
  );
}
