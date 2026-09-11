import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  title: string;
  value: string;
  description?: string;
  icon: LucideIcon;
  iconClassName?: string;
}

/** Stat tile used on the Overview page (server component friendly). */
export function KpiCard({ title, value, description, icon: Icon, iconClassName }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-1 truncate text-2xl font-semibold tracking-tight">{value}</p>
          {description ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary',
            iconClassName,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
