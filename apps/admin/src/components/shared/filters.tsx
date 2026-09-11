import * as React from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FilterFormProps {
  /** GET target — the page path. */
  action: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * GET-form wrapper for table filters. Children are plain inputs/selects with
 * `name` attributes; submitting reloads the page with the query string
 * (server-rendered friendly, no client state). Reset link returns to the
 * unfiltered page.
 */
export function FilterForm({ action, children, className }: FilterFormProps) {
  return (
    <form
      action={action}
      method="get"
      className={
        className ??
        'flex flex-wrap items-end gap-2 rounded-lg border bg-card/50 p-3'
      }
    >
      {children}
      <Button type="submit" size="sm" variant="secondary">
        Apply
      </Button>
      <Button asChild size="sm" variant="ghost">
        <a href={action}>
          <RotateCcw />
          Reset
        </a>
      </Button>
    </form>
  );
}

/** Labeled filter field wrapper. */
export function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={className ?? 'flex min-w-[9rem] flex-col gap-1 text-xs font-medium text-muted-foreground'}>
      <span>{label}</span>
      {children}
    </label>
  );
}
