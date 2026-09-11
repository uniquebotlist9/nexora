import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@nexora/ui';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  /** Optional trend indicator, e.g. "+12% this week". */
  trend?: string;
  trendPositive?: boolean;
  className?: string;
}

export function StatCard({ label, value, icon: Icon, trend, trendPositive, className }: StatCardProps) {
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
          {trend && (
            <p
              className={cn(
                'mt-1 text-xs font-medium',
                trendPositive === false ? 'text-destructive' : 'text-emerald-500',
              )}
            >
              {trend}
            </p>
          )}
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4.5 w-4.5 h-5 w-5 text-primary" aria-hidden="true" />
        </div>
      </div>
    </Card>
  );
}
