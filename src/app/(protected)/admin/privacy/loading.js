import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <div className="space-y-6"><Skeleton className="h-24 w-full max-w-3xl" /><Skeleton className="h-48" /><Skeleton className="h-72" /></div>;
}
