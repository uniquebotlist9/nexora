import { cn } from '@/lib/utils';

export type HealthStatus = 'ok' | 'warn' | 'down' | 'unknown';

const HEALTH_DOT_CLASSES: Record<HealthStatus, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500 animate-pulse',
  down: 'bg-red-500 animate-pulse',
  unknown: 'bg-muted-foreground',
};

/** Colored status dot for the system health panels. */
export function HealthDot({ status, className }: { status: HealthStatus; className?: string }) {
  return (
    <span className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', HEALTH_DOT_CLASSES[status], className)} />
  );
}
