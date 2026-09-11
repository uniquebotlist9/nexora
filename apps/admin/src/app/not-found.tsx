import Link from 'next/link';
import { Bot, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Bot className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you are looking for does not exist or has been moved.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">
            <Home className="mr-2 h-4 w-4" />
            Back to overview
          </Link>
        </Button>
      </div>
    </main>
  );
}
