import { cn } from '@nexora/ui';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('h-8 w-8', className)} aria-hidden="true">
      <defs>
        <linearGradient id="nexora-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5865F2" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <path
        d="M20 46V18l24 28V18"
        fill="none"
        stroke="url(#nexora-logo-g)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className, textClassName }: { className?: string; textClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className={cn('text-lg font-bold tracking-tight', textClassName)}>NEXORA</span>
    </span>
  );
}
