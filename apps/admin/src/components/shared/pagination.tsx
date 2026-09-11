import { Fragment } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SearchParams } from '@/lib/pagination';

interface PaginationProps {
  page: number;
  pageCount: number;
  basePath: string;
  /** Current filters, preserved when navigating between pages. */
  searchParams?: SearchParams;
  className?: string;
}

function buildHref(basePath: string, searchParams: SearchParams | undefined, page: number): string {
  const params = new URLSearchParams();
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === 'page') continue;
      const single = Array.isArray(value) ? value[0] : value;
      if (single !== undefined && single !== '') params.set(key, single);
    }
  }
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Link-based pagination for server-rendered tables. */
export function Pagination({ page, pageCount, basePath, searchParams, className }: PaginationProps) {
  if (pageCount <= 1) return null;

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === pageCount || Math.abs(p - page) <= 1,
  );

  return (
    <nav
      aria-label="Pagination"
      className={cn('flex items-center justify-center gap-1.5', className)}
    >
      <Button asChild variant="outline" size="icon" disabled={page <= 1} aria-label="Previous page">
        <Link
          href={buildHref(basePath, searchParams, Math.max(1, page - 1))}
          aria-disabled={page <= 1}
          className={page <= 1 ? 'pointer-events-none opacity-50' : undefined}
        >
          <ChevronLeft />
        </Link>
      </Button>
      {pages.map((p, index) => {
        const previous = pages[index - 1];
        const gap = previous !== undefined && p - previous > 1;
        return (
          <Fragment key={p}>
            {gap ? <span className="px-1 text-muted-foreground">…</span> : null}
            <Button asChild variant={p === page ? 'default' : 'outline'} size="icon">
              <Link href={buildHref(basePath, searchParams, p)}>{p}</Link>
            </Button>
          </Fragment>
        );
      })}
      <Button
        asChild
        variant="outline"
        size="icon"
        disabled={page >= pageCount}
        aria-label="Next page"
      >
        <Link
          href={buildHref(basePath, searchParams, Math.min(pageCount, page + 1))}
          aria-disabled={page >= pageCount}
          className={page >= pageCount ? 'pointer-events-none opacity-50' : undefined}
        >
          <ChevronRight />
        </Link>
      </Button>
    </nav>
  );
}
