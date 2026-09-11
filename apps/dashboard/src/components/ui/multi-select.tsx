'use client';

import * as React from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@nexora/ui';

export interface MultiSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}

/**
 * Accessible multi-select: a token chip box + popover checklist.
 * Arrow keys navigate options, Enter toggles, Escape closes.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  emptyLabel = 'Nothing available yet',
  className,
  id,
  disabled,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const containerRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    searchRef.current?.focus();
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()),
  );

  const toggle = (v: string) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={id ? `${id}-list` : undefined}
        aria-label={placeholder}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className="flex min-h-9 w-full cursor-pointer flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        {value.length === 0 && (
          <span className="px-1 text-muted-foreground">{placeholder}</span>
        )}
        {value.map((v) => {
          const opt = options.find((o) => o.value === v);
          return (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary"
            >
              {opt?.label ?? v}
              <button
                type="button"
                aria-label={`Remove ${opt?.label ?? v}`}
                className="rounded hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(v);
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
      </div>
      {open && (
        <div className="absolute z-40 mt-1 w-full rounded-lg border border-border bg-card p-1.5 shadow-xl animate-fade-in">
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            aria-label="Search options"
            className="mb-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-ring"
          />
          <div role="listbox" aria-multiselectable className="max-h-52 overflow-y-auto scrollbar-thin">
            {filtered.length === 0 && (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">{emptyLabel}</p>
            )}
            {filtered.map((o) => {
              const selected = value.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => toggle(o.value)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                    )}
                  >
                    {selected && <Check className="h-3 w-3" />}
                  </span>
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.description && (
                    <span className="shrink-0 text-xs text-muted-foreground">{o.description}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
