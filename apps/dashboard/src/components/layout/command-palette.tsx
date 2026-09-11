'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { flattenNav } from '@/lib/nav';

interface CommandPaletteProps {
  guildId: string;
  /** Extra entries beyond guild nav (e.g. "Create automation"). */
  extraItems?: { label: string; href: string }[];
}

/**
 * ⌘K / Ctrl+K command palette for quick navigation between config pages.
 * Rendered by the Topbar; opens on keyboard shortcut or click.
 */
export function CommandPalette({ guildId, extraItems = [] }: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const navItems = React.useMemo(() => flattenNav(guildId), [guildId]);
  const items = React.useMemo(
    () => [
      ...navItems.map((i) => ({ label: i.label, href: i.href, section: i.section })),
      ...extraItems.map((i) => ({ label: i.label, href: i.href, section: 'Quick actions' })),
    ],
    [navItems, extraItems],
  );

  const filtered = React.useMemo(
    () => items.filter((i) => i.label.toLowerCase().includes(query.toLowerCase())),
    [items, query],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  React.useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  React.useEffect(() => setActiveIndex(0), [query]);

  const select = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[activeIndex]) {
      e.preventDefault();
      select(filtered[activeIndex]!.href);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open command palette (Ctrl+K)"
        className="hidden h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground transition hover:bg-muted focus-ring sm:flex sm:w-48 lg:w-64"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="hidden rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] lg:inline">⌘K</kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="rounded-lg p-2 text-muted-foreground hover:bg-muted focus-ring sm:hidden"
      >
        <Search className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[15vh]">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl animate-fade-in"
          >
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Jump to a setting…"
                aria-label="Search settings"
                className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-72 overflow-y-auto p-1.5 scrollbar-thin">
              {filtered.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No matches for “{query}”
                </p>
              )}
              {filtered.map((item, i) => (
                <button
                  key={`${item.href}-${item.label}`}
                  onClick={() => select(item.href)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                    i === activeIndex ? 'bg-primary/15 text-primary' : 'hover:bg-muted'
                  }`}
                >
                  <span>{item.label}</span>
                  <span className="text-xs text-muted-foreground">{item.section}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
