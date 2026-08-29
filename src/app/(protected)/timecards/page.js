import { randomUUID } from "node:crypto";

import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClockIcon, ClipboardCheckIcon } from "lucide-react";

import { PrepareTimecardForm } from "@/app/(protected)/timecards/components/timecard-forms";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ResponsiveRecord } from "@/components/ui/responsive-record";
import { getStatusPresentation, StatusBadge } from "@/components/ui/status-badge";
import { formatDateRange, formatMoney } from "@/lib/hr-format";
import { cn } from "@/lib/utils";
import { requireOvertimeContext } from "@/overtime/access";
import { getDefaultClosedPeriod, getEmployeeTimecards } from "@/overtime/service";

export const metadata = { title: "Timecards | HR Pulse" };

function hours(seconds) { return `${(seconds / 3600).toFixed(2)} h`; }

export default async function EmployeeTimecardsPage({ searchParams }) {
  const params = await searchParams;
  const context = await requireOvertimeContext();
  if (context.membership.role !== "employee") redirect("/timecards/review");
  const [page, period] = await Promise.all([getEmployeeTimecards(context, { cursor: params?.cursor }), getDefaultClosedPeriod(context.organizationId, context.organization.timezone)]);
  return <div className="flex flex-col gap-8"><header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-sm font-medium text-muted-foreground">Your approved time record</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Review time before payroll</h1><p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">Every local date, attendance source, and overtime amount stays visible before you submit the period for independent approval.</p></div>{period && context.employeeId ? <PrepareTimecardForm employeeId={context.employeeId} period={period} requestId={randomUUID()} /> : null}</header><Card><CardHeader><CardTitle>Timecard periods</CardTitle><CardDescription>Newest closed payroll period first. Approved snapshots are final payroll evidence.</CardDescription></CardHeader><CardContent>{page.rows.length === 0 ? <Empty><EmptyHeader><EmptyMedia variant="icon"><ClipboardCheckIcon aria-hidden="true" /></EmptyMedia><EmptyTitle>No timecards prepared</EmptyTitle><EmptyDescription>Prepare the latest closed period when attendance and pay setup are ready.</EmptyDescription></EmptyHeader></Empty> : <div className="flex flex-col gap-3">{page.rows.map((card) => <ResponsiveRecord action={<Link className={cn(buttonVariants({ variant: "outline" }))} href={`/timecards/${card.id}`}>Review</Link>} key={card.id} priorityValues={[{ label: "Period", value: formatDateRange(card.periodStart, card.periodEnd) }, { label: "Worked", value: hours(card.workedSeconds) }]} secondaryValues={[{ label: "Overtime", value: hours(card.overtimeSeconds) }, { label: "Overtime earning", value: formatMoney(card.overtimeAmountMinor, card.currency) }, { label: "Timezone", value: card.timezone }]} title={<span className="flex flex-wrap items-center gap-2"><CalendarClockIcon aria-hidden="true" /><StatusBadge {...getStatusPresentation(card.status)} /></span>} />)}{page.nextCursor ? <Link className={cn(buttonVariants({ variant: "outline" }), "self-start")} href={`/timecards?cursor=${encodeURIComponent(page.nextCursor)}`}>Older timecards</Link> : null}</div>}</CardContent></Card></div>;
}
