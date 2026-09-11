import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/guild';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { UserMenu } from '@/components/layout/user-menu';

export const dynamic = 'force-dynamic';

/**
 * Chrome for user-scoped dashboard pages (billing, profile, API docs) — these
 * are not guild pages, so they get a light top bar instead of the guild shell.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect('/auth/signin');

  const links = [
    { label: 'My servers', href: '/dashboard' },
    { label: 'Billing', href: '/dashboard/billing' },
    { label: 'Profile', href: '/dashboard/profile' },
    { label: 'API docs', href: '/dashboard/api-docs' },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur-lg sm:px-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-lg px-1 py-0.5 text-sm font-bold tracking-tight focus-ring"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-primary text-xs font-black text-white">
            N
          </span>
          Nexora
        </Link>
        <nav className="ml-2 hidden items-center gap-1 sm:flex" aria-label="Account">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground focus-ring"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <UserMenu
            name={session.user.name}
            email={session.user.email}
            image={session.user.image}
          />
        </div>
      </header>
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
