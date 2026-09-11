import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface AccessDeniedProps {
  page: string;
  role: string | null | undefined;
}

/** Rendered when a signed-in staff member's role lacks access to a page. */
export function AccessDenied({ page, role }: AccessDeniedProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
          <ShieldAlert className="h-6 w-6 text-red-400" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">Access denied</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Your role{role ? ` (${role})` : ''} does not have access to the {page} page. Contact
          an OWNER if you believe this is a mistake.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/">Back to overview</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
