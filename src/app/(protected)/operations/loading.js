import { Skeleton } from "@/components/ui/skeleton";

export default function OperationsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading operations" className="flex flex-col gap-8">
      <div className="flex flex-col gap-3"><Skeleton className="h-4 w-40" /><Skeleton className="h-12 w-3/4" /><Skeleton className="h-5 w-full max-w-2xl" /></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      <div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
    </div>
  );
}
