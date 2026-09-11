'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function PanelError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
          <AlertTriangle className="h-6 w-6 text-amber-400" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">Something went wrong</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          An unexpected error occurred while loading this page. Try again — if it persists,
          check the server logs.
        </p>
        <Button onClick={reset} className="mt-6">
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}
