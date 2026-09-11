'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { signOut } from 'next-auth/react';
import { Bot, LogOut, Menu, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NAV_ITEMS, navTitleForPath } from '@/components/layout/nav-items';
import { ADMIN_ROLE_VARIANT } from '@/lib/badges';
import { canAccessPage, type AdminRole } from '@/lib/roles';
import { cn } from '@/lib/utils';

export interface ShellUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: AdminRole;
}

interface AppShellProps {
  user: ShellUser;
  children: React.ReactNode;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin' || pathname === '/admin/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarNav({
  role,
  pathname,
  onNavigate,
}: {
  role: AdminRole;
  pathname: string;
  onNavigate?: () => void;
}) {
  const items = NAV_ITEMS.filter((item) => canAccessPage(role, item.key));
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function BrandMark() {
  return (
    <Link href="/admin" className="flex items-center gap-2.5 px-5 pt-5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Bot className="h-5 w-5" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold">Nexora</span>
        <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
          Staff Console
        </span>
      </span>
    </Link>
  );
}

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const title = navTitleForPath(pathname);
  const initials = (user.name ?? user.id).slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-card/60 backdrop-blur lg:flex">
        <BrandMark />
        <SidebarNav role={user.role} pathname={pathname} />
        <p className="px-5 py-4 text-[11px] text-muted-foreground">Nexora Admin v1.0</p>
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-black/70"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="absolute inset-y-0 left-0 flex w-64 flex-col border-r bg-card"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <div className="flex items-center justify-between pr-3">
                <BrandMark />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close menu"
                  onClick={() => setMobileOpen(false)}
                >
                  <X />
                </Button>
              </div>
              <SidebarNav
                role={user.role}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu />
          </Button>
          <h1 className="truncate text-sm font-semibold">{title}</h1>
          <div className="ml-auto flex items-center gap-3">
            <Badge variant={ADMIN_ROLE_VARIANT[user.role]}>{user.role}</Badge>
            <div className="hidden items-center gap-2 sm:flex">
              {user.image ? (
                <Image
                  src={user.image}
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 rounded-full border"
                  unoptimized
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full border bg-muted text-xs font-medium">
                  {initials}
                </span>
              )}
              <span className="max-w-[140px] truncate text-sm text-muted-foreground">
                {user.name ?? user.id}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              title="Sign out"
              onClick={() => signOut({ callbackUrl: '/login' })}
            >
              <LogOut />
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="mx-auto w-full max-w-7xl"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
