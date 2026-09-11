'use client';

import * as React from 'react';
import { cn } from '@nexora/ui';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** CSS-only tooltip that shows on hover and focus. */
export function Tooltip({ content, children, className }: TooltipProps) {
  return (
    <span className={cn('group/tooltip relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[220px] -translate-x-1/2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-card-foreground opacity-0 shadow-lg transition-opacity',
          'group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100',
        )}
      >
        {content}
      </span>
    </span>
  );
}
