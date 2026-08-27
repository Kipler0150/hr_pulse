import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PayrollLoading() {
  return <div aria-label="Loading payroll" className="flex flex-col gap-6" role="status"><Skeleton className="h-10 max-w-xl" /><Skeleton className="h-6 max-w-2xl" /><div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><Skeleton className="h-6 w-2/3" /></CardHeader><CardContent><Skeleton className="h-32 w-full" /></CardContent></Card><Card><CardHeader><Skeleton className="h-6 w-2/3" /></CardHeader><CardContent><Skeleton className="h-32 w-full" /></CardContent></Card></div></div>;
}
