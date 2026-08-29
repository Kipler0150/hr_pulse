import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function TimecardsLoading() {
  return <div aria-busy="true" aria-label="Loading timecards" className="flex flex-col gap-8" role="status"><div className="flex flex-col gap-3"><Skeleton className="h-4 w-40" /><Skeleton className="h-10 w-full max-w-xl" /><Skeleton className="h-5 w-full max-w-2xl" /></div><div className="grid gap-4 lg:grid-cols-2">{[0, 1].map((item) => <Card key={item}><CardHeader><Skeleton className="h-5 w-36" /><Skeleton className="h-7 w-56" /></CardHeader><CardContent><Skeleton className="h-28 w-full" /></CardContent></Card>)}</div><span className="sr-only">Loading timecards</span></div>;
}
