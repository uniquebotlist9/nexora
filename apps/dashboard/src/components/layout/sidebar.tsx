'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { GUILD_NAV, guildPath } from '@/lib/nav';
import { Logo } from '@/components/shared/logo';
import { cn } from '@nexora/ui';

interface SidebarProps {
  guildId: string;
  /** Mobile drawer state is owned by the shell. */
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ guildId, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem('nexora-sidebar-collapsed');
      if (stored === '1') setCollapsed(true);
    } catch {
      // ignore
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      try {
        window.localStorage.setItem('nexora-sidebar-collapsed', v ? '0' : '1');
      } catch {
        // ignore
      }
      return !v;
    });
  };

  const isActive = (segment: string) => {
    const path = guildPath(guildId, segment);
    return segment === '' ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <>
      {/* Mobile drawer backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Guild navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-card transition-all duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0',
          collapsed ? 'md:w-[68px]' : 'md:w-60',
          'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <Link href="/dashboard" className="focus-ring rounded" onClick={onMobileClose}>
            <Logo textClassName={cn(collapsed && 'md:hidden', 'text-base')} />
          </Link>
          <button
            type="button"
            onClick={onMobileClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted md:hidden focus-ring"
            aria-label="Close navigation"
          >
            <PanelLeftClose className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
          {GUILD_NAV.map((section) => (
            <div key={section.title} className="mb-4">
              <p
                className={cn(
                  'px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
                  collapsed && 'md:text-center md:px-0',
                )}
              >
                {collapsed ? '·' : section.title}
              </p>
              <ul className="mt-1 space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const href = guildPath(guildId, item.segment);
                  return (
                    <li key={item.segment}>
                      <Link
                        href={href}
                        onClick={onMobileClose}
                        aria-current={isActive(item.segment) ? 'page' : undefined}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors focus-ring',
                          isActive(item.segment)
                            ? 'bg-primary/15 text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className={cn('truncate', collapsed && 'md:hidden')}>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="hidden shrink-0 border-t border-border p-2 md:block">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-ring"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
