'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@nexora/ui';

export type AnalyticsRange = '7' | '30' | '90' | '365' | 'custom';

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
];

export function AnalyticsRangePicker({
  guildId,
  current,
  from,
  to,
  retentionDays,
  plan,
}: {
  guildId: string;
  current: AnalyticsRange;
  from?: string;
  to?: string;
  retentionDays: number;
  plan: string;
}) {
  const router = useRouter();
  const [customFrom, setCustomFrom] = React.useState(from ?? '');
  const [customTo, setCustomTo] = React.useState(to ?? '');

  const navigate = (range: AnalyticsRange, extra?: Record<string, string>) => {
    const params = new URLSearchParams({ range });
    if (range === 'custom') {
      if (extra?.from) params.set('from', extra.from);
      if (extra?.to) params.set('to', extra.to);
    }
    router.push(`/dashboard/g/${guildId}/analytics?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Date range"
        className="inline-flex rounded-lg bg-muted p-1"
      >
        {RANGES.map((r) => {
          const locked = Number(r.value) > retentionDays;
          return (
            <button
              key={r.value}
              type="button"
              disabled={locked}
              title={locked ? `Requires an upgrade (retention: ${retentionDays} days)` : undefined}
              onClick={() => navigate(r.value)}
              aria-pressed={current === r.value}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-ring',
                current === r.value ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground',
                locked && 'cursor-not-allowed opacity-50',
              )}
            >
              {r.label}
              {locked && <Lock className="h-3 w-3" aria-hidden="true" />}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => navigate('custom')}
          aria-pressed={current === 'custom'}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-ring',
            current === 'custom' ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Custom
        </button>
      </div>

      {current === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            aria-label="From date"
            className="w-40"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            aria-label="To date"
            className="w-40"
          />
          <Button
            size="sm"
            disabled={!customFrom}
            onClick={() => navigate('custom', { from: customFrom, to: customTo })}
          >
            Apply
          </Button>
        </div>
      )}

      {retentionDays < 365 && (
        <p className="w-full text-xs text-muted-foreground">
          Your {plan} plan retains {retentionDays} days of analytics — longer ranges unlock with an{' '}
          <a href="/#pricing" className="text-primary underline-offset-4 hover:underline">
            upgrade
          </a>
          .
        </p>
      )}
    </div>
  );
}
