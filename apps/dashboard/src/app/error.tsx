'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[nexora:dashboard]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="max-w-md text-muted-foreground">
          An unexpected error occurred while loading this page. Please try again — if it
          persists, the issue has been logged with ID{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {error.digest ?? 'unknown'}
          </code>
          .
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-ring"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted focus-ring"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}
