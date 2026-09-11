'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@nexora/ui';

export interface FaqItem {
  question: string;
  answer: string;
}

/** Accessible accordion (button + region, aria-expanded, keyboard native). */
export function Faq({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = React.useState<number | null>(0);

  return (
    <div className="mx-auto max-w-2xl divide-y divide-border rounded-2xl border border-border bg-card">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={i}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`faq-panel-${i}`}
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium transition-colors hover:bg-muted/40 focus-ring"
            >
              {item.question}
              <ChevronDown
                className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')}
                aria-hidden="true"
              />
            </button>
            <div
              id={`faq-panel-${i}`}
              role="region"
              className={cn('grid transition-all', isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-4 text-sm text-muted-foreground">{item.answer}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
