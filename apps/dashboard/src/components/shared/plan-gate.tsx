import type { ReactNode } from 'react';
import Link from 'next/link';
import { Lock, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@nexora/ui';

interface PlanGateProps {
  /** Whether the current plan unlocks this feature. */
  locked: boolean;
  /** Message shown in the lock overlay. */
  feature: string;
  /** Minimum plan required, e.g. "PRO". */
  requiredPlan: string;
  children: ReactNode;
  /** Blur the locked content behind the overlay. */
  blur?: boolean;
  className?: string;
}

/**
 * Premium gate overlay: wraps feature content and, when locked, renders a
 * blurred preview with an upgrade CTA.
 */
export function PlanGate({ locked, feature, requiredPlan, children, blur = true, className }: PlanGateProps) {
  if (!locked) return <>{children}</>;

  return (
    <div className={cn('relative', className)}>
      <div className={cn(blur && 'pointer-events-none select-none opacity-40 blur-[2px]')} aria-hidden="true">
        {children}
      </div>
      <Card className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 border-dashed bg-card/80 p-6 text-center backdrop-blur-sm">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
          <Lock className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold">
            {feature} requires <span className="text-gradient">{requiredPlan}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Unlock it and more with a Nexora premium plan.
          </p>
        </div>
        <Link
          href="/#pricing"
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-primary px-4 py-2 text-sm font-semibold text-white shadow transition hover:opacity-90 focus-ring"
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Upgrade
        </Link>
      </Card>
    </div>
  );
}
