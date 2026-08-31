import { randomUUID } from "node:crypto";
import Link from "next/link";
import { CalendarDaysIcon, TriangleAlertIcon } from "lucide-react";

import { getEmployeeLeaveRequests } from "@/time-off/queries";
import { requireTimeOffContext } from "@/time-off/access";
import { serializeTimeOffError } from "@/time-off/config";
import { LeaveRequestForm } from "./components/time-off-forms";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ResponsiveRecord } from "@/components/ui/responsive-record";
import { StatusBadge, getStatusPresentation } from "@/components/ui/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { formatDateOnly } from "@/lib/hr-format";

export const metadata = { title: "Time off | HR Pulse" };

function value(input) { return typeof input === "string" ? input : ""; }

export default async function TimeOffPage({ searchParams }) {
  const params = await searchParams;
  const filters = { status: value(params?.status), startDate: value(params?.startDate), endDate: value(params?.endDate), cursor: value(params?.cursor) };
  let context; let result; let issue;
  try {
    context = await requireTimeOffContext();
    result = await getEmployeeLeaveRequests({ context, ...filters });
  } catch (error) {
    issue = serializeTimeOffError(error);
  }
  if (!context || !result) return <Alert variant="destructive"><TriangleAlertIcon aria-hidden="true" /><AlertTitle>{issue.message}</AlertTitle><AlertDescription>{issue.guidance}</AlertDescription></Alert>;
  const nextParams = new URLSearchParams({ ...(filters.status ? { status: filters.status } : {}), ...(filters.startDate ? { startDate: filters.startDate } : {}), ...(filters.endDate ? { endDate: filters.endDate } : {}), ...(result?.nextCursor ? { cursor: result.nextCursor } : {}) });
  return (
    <div className="flex flex-col gap-8">
      <header><p className="text-sm font-medium text-muted-foreground">Employee self service</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Time off, clearly recorded</h1><p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">Request whole calendar dates, then return here for the current decision and protected workflow history.</p></header>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><LeaveRequestForm retryRequestId={randomUUID()} /><Card><CardHeader><CardTitle>Reviewer availability</CardTitle></CardHeader><CardContent className="text-sm leading-6 text-muted-foreground">Your current reporting line decides who can review a request. If no eligible manager is available, an administrator can provide bounded fallback access.</CardContent></Card></div>
      <section aria-labelledby="history-title" className="flex flex-col gap-4"><div><h2 className="text-xl font-semibold" id="history-title">Request history</h2><p className="mt-1 text-sm text-muted-foreground">Newest requests first, up to 50 records.</p></div>
        <Card><CardContent><form className="flex flex-wrap items-end gap-3" method="get"><Field><FieldLabel htmlFor="history-status">Status</FieldLabel><NativeSelect defaultValue={filters.status} id="history-status" name="status"><NativeSelectOption value="">All active history</NativeSelectOption>{["submitted", "approved", "declined", "cancelled"].map((status) => <NativeSelectOption key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</NativeSelectOption>)}</NativeSelect></Field><Field><FieldLabel htmlFor="history-start-date">From date</FieldLabel><Input defaultValue={filters.startDate} id="history-start-date" name="startDate" type="date" /></Field><Field><FieldLabel htmlFor="history-end-date">To date</FieldLabel><Input defaultValue={filters.endDate} id="history-end-date" name="endDate" type="date" /></Field><button className={buttonVariants({ variant: "outline" })} type="submit">Apply filter</button></form></CardContent></Card>
        {result.rows.length === 0 ? <Card><CardContent><Empty><EmptyHeader><EmptyMedia variant="icon"><CalendarDaysIcon aria-hidden="true" /></EmptyMedia><EmptyTitle>No requests yet</EmptyTitle><EmptyDescription>Your submitted requests will appear here.</EmptyDescription></EmptyHeader></Empty></CardContent></Card> : <div className="flex flex-col gap-3">{result.rows.map((request) => <ResponsiveRecord key={request.id} action={<Link className={buttonVariants({ variant: "outline" })} href={`/time-off/${request.id}`}>View request</Link>} priorityValues={[{ label: "Dates", value: `${formatDateOnly(request.startDate)} to ${formatDateOnly(request.endDate)}` }, { label: "Status", value: <StatusBadge {...getStatusPresentation(request.status)} /> }]} secondaryValues={[{ label: "Type", value: request.leaveType }, { label: "Calendar days", value: request.calendarDays }, { label: "Reason", value: request.reason || "Not provided" }]} title="Time off request" />)}{result.nextCursor ? <Link className={buttonVariants({ variant: "outline" })} href={`/time-off?${nextParams.toString()}`}>Next 50 requests</Link> : null}</div>}
      </section>
    </div>
  );
}
