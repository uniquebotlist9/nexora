import {
  LayoutDashboard,
  Users,
  Shield,
  Hash,
  Gavel,
  Bot,
  ShieldAlert,
  ScrollText,
  DoorOpen,
  DoorClosed,
  BadgeCheck,
  Gift,
  MousePointerClick,
  Ticket,
  TrendingUp,
  Coins,
  SquareTerminal,
  Workflow,
  BarChart3,
  Plug,
  DatabaseBackup,
  Crown,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  /** Path relative to /dashboard/g/[guildId]. */
  segment: string;
  icon: LucideIcon;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const GUILD_NAV: NavSection[] = [
  {
    title: 'General',
    items: [
      { label: 'Overview', segment: '', icon: LayoutDashboard },
      { label: 'Members', segment: 'members', icon: Users },
      { label: 'Roles', segment: 'roles', icon: Shield },
      { label: 'Channels', segment: 'channels', icon: Hash },
    ],
  },
  {
    title: 'Moderation',
    items: [
      { label: 'Moderation', segment: 'moderation', icon: Gavel },
      { label: 'AutoMod', segment: 'automod', icon: Bot },
      { label: 'Anti-Raid', segment: 'anti-raid', icon: ShieldAlert },
      { label: 'Logging', segment: 'logging', icon: ScrollText },
    ],
  },
  {
    title: 'Engagement',
    items: [
      { label: 'Welcome', segment: 'welcome', icon: DoorOpen },
      { label: 'Goodbye', segment: 'goodbye', icon: DoorClosed },
      { label: 'Verification', segment: 'verification', icon: BadgeCheck },
      { label: 'Giveaways', segment: 'giveaways', icon: Gift },
      { label: 'Reaction Roles', segment: 'reaction-roles', icon: MousePointerClick },
    ],
  },
  {
    title: 'Core Systems',
    items: [
      { label: 'Tickets', segment: 'tickets', icon: Ticket },
      { label: 'Leveling', segment: 'leveling', icon: TrendingUp },
      { label: 'Economy', segment: 'economy', icon: Coins },
      { label: 'Commands', segment: 'commands', icon: SquareTerminal },
      { label: 'Automations', segment: 'automations', icon: Workflow },
      { label: 'Analytics', segment: 'analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Integrations', segment: 'integrations', icon: Plug },
      { label: 'Backups', segment: 'backups', icon: DatabaseBackup },
      { label: 'Premium', segment: 'premium', icon: Crown },
      { label: 'Settings', segment: 'settings', icon: Settings },
    ],
  },
];

export function guildPath(guildId: string, segment: string): string {
  return segment ? `/dashboard/g/${guildId}/${segment}` : `/dashboard/g/${guildId}`;
}

/** Flat list used by the command palette. */
export function flattenNav(guildId: string): { label: string; icon: LucideIcon; href: string; section: string }[] {
  return GUILD_NAV.flatMap((section) =>
    section.items.map((item) => ({
      label: item.label,
      icon: item.icon,
      href: guildPath(guildId, item.segment),
      section: section.title,
    })),
  );
}

export function labelForSegment(segment: string): string {
  for (const section of GUILD_NAV) {
    const item = section.items.find((i) => i.segment === segment);
    if (item) return item.label;
  }
  return segment;
}
