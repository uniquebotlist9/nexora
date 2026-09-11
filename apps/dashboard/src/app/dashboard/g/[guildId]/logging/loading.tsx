import { Skeleton } from '@/components/ui/skeleton';

export default function PageLoading() {
  return (
    <div>
      <Skeleton className="h-7 w-44" />
      <Skeleton className="mt-2 h-4 w-72" />
      <div className="mt-6 space-y-4">
        <Skeleton className="h-16" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    </div>
  );
}
