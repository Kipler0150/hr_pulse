import Link from "next/link";
import { Clock3Icon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ResponsiveRecord } from "@/components/ui/responsive-record";
import { formatDateRange } from "@/lib/hr-format";
import { cn } from "@/lib/utils";
import { requireSelfServiceContext } from "@/self-service/access";
import { SelfServiceError } from "@/self-service/errors";
import { listApprovedTimecards } from "@/self-service/queries";

export const metadata = { title: "Approved time | HR Pulse" };
const hours = (seconds) => `${(seconds / 3600).toFixed(2)} h`;

export default async function SelfServiceTimePage({ searchParams }) {
  const context = await requireSelfServiceContext(); const params = await searchParams;
  let page;
  try { page = await listApprovedTimecards(context, params?.cursor); }
  catch (error) {
    if (error instanceof SelfServiceError && error.code === "SELF_SERVICE_INVALID_CURSOR") {
      return <div className="flex flex-col gap-6"><h1 className="text-3xl font-semibold tracking-tight">Your finalized time evidence</h1><div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4"><p className="font-medium">This page link is invalid.</p><p className="mt-1 text-sm text-muted-foreground">Return to the first page and try again.</p><Link className={cn(buttonVariants({ variant: "outline" }), "mt-4")} href="/self-service/time">First page</Link></div></div>;
    }
    throw error;
  }
  return <div className="flex flex-col gap-8"><header><Link className={cn(buttonVariants({ variant: "ghost" }), "-ml-3")} href="/self-service">Self service</Link><p className="mt-4 text-sm font-medium text-muted-foreground">Approved time</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Your finalized time evidence</h1><p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">These approved timecards are read only snapshots used for payroll.</p></header><Card><CardHeader><CardTitle>Timecard history</CardTitle><CardDescription>Newest approved period first.</CardDescription></CardHeader><CardContent>{page.rows.length ? <div className="flex flex-col gap-3">{page.rows.map((row) => <ResponsiveRecord action={<Link className={buttonVariants({ variant: "outline" })} href={`/self-service/time/${row.id}`}>View evidence</Link>} key={row.id} priorityValues={[{ label: "Period", value: formatDateRange(row.periodStart, row.periodEnd) }, { label: "Worked", value: hours(row.workedSeconds) }]} secondaryValues={[{ label: "Overtime", value: hours(row.overtimeSeconds) }, { label: "Timezone", value: row.timezone }]} title="Approved timecard" />)}{page.nextCursor ? <Link className={cn(buttonVariants({ variant: "outline" }), "self-start")} href={`/self-service/time?cursor=${encodeURIComponent(page.nextCursor)}`}>Older timecards</Link> : null}</div> : <Empty><EmptyHeader><EmptyMedia variant="icon"><Clock3Icon aria-hidden="true" /></EmptyMedia><EmptyTitle>No approved timecards</EmptyTitle><EmptyDescription>Your approved time evidence will appear here after review.</EmptyDescription></EmptyHeader></Empty>}</CardContent></Card></div>;
}
