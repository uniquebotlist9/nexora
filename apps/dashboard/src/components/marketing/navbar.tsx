'use client';

import * as React from 'react';
import Link from 'next/link';
import { Menu, X, LogIn } from 'lucide-react';
import { Logo } from '@/components/shared/logo';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@nexora/ui';

const LINKS = [
  { href: '/#features', label: 'Features' },
  { href: '/#moderation', label: 'Moderation' },
  { href: '/#automations', label: 'Automation' },
  { href: '/#analytics', label: 'Analytics' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
];

export function MarketingNavbar() {
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-40 transition-all',
        scrolled ? 'border-b border-border bg-background/80 backdrop-blur-lg' : 'bg-transparent',
      )}
    >
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="focus-ring rounded" aria-label="Nexora home">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-ring"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link href="/dashboard" className={cn(buttonVariants({ variant: 'ghost' }), 'focus-ring')}>
            <LogIn className="h-4 w-4" aria-hidden="true" /> Login
          </Link>
          <a href="/api/invite" className={cn(buttonVariants({ variant: 'gradient' }), 'focus-ring')}>
            Add to Discord
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted focus-ring md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <nav
          aria-label="Mobile"
          className="border-t border-border bg-background/95 px-4 py-3 backdrop-blur-lg md:hidden"
        >
          <ul className="space-y-1">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-ring"
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li className="flex gap-2 pt-2">
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-lg border border-border px-3 py-2.5 text-center text-sm font-medium focus-ring"
              >
                Login
              </Link>
              <a
                href="/api/invite"
                className="flex-1 rounded-lg bg-gradient-primary px-3 py-2.5 text-center text-sm font-semibold text-white focus-ring"
              >
                Add to Discord
              </a>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
