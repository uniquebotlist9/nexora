import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart3,
  CreditCard,
  Gavel,
  LayoutDashboard,
  MessageSquareQuote,
  ScrollText,
  Server,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { PageKey } from '@/lib/roles';

export interface NavItem {
  key: PageKey;
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Sidebar order. Visibility is filtered by PAGE_ROLES (canAccessPage). */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'overview', href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { key: 'guilds', href: '/admin/guilds', label: 'Guilds', icon: Server },
  { key: 'users', href: '/admin/users', label: 'Users', icon: Users },
  { key: 'subscriptions', href: '/admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { key: 'moderation', href: '/admin/moderation', label: 'Moderation', icon: Gavel },
  { key: 'feedback', href: '/admin/feedback', label: 'Feedback', icon: MessageSquareQuote },
  { key: 'analytics', href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { key: 'system', href: '/admin/system', label: 'System', icon: Activity },
  { key: 'audit', href: '/admin/audit', label: 'Audit Log', icon: ScrollText },
  { key: 'staff', href: '/admin/staff', label: 'Staff', icon: ShieldCheck },
];

export function navTitleForPath(pathname: string): string {
  if (pathname === '/admin' || pathname === '/admin/') return 'Overview';
  const match = [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => item.href !== '/admin' && pathname.startsWith(item.href));
  return match?.label ?? 'Nexora Admin';
}
