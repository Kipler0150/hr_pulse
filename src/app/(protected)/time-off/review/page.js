import { ClipboardCheckIcon, UsersRoundIcon } from "lucide-react";
import Link from "next/link";
import { requireTimeOffContext } from "@/time-off/access";
import { getLeaveReviewQueue } from "@/time-off/queries";
import { serializeTimeOffError } from "@/time-off/config";
import { buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { formatDateOnly } from "@/lib/hr-format";

export const metadata = { title: "Time off review | HR Pulse" };

function value(input) { return typeof input === "string" ? input : ""; }

export default async function TimeOffReviewPage({ searchParams }) {
  const params = await searchParams;
  const filters = { status: value(params?.status) || "submitted", startDate: value(params?.startDate), endDate: value(params?.endDate), employeeId: value(params?.employeeId), cursor: value(params?.cursor) };
  let context; let queue; let issue;
  try {
    context = await requireTimeOffContext({ review: true });
    queue = await getLeaveReviewQueue({ context, ...filters });
  } catch (error) {
    issue = serializeTimeOffError(error);
  }
  if (!context || !queue) return <Alert variant="destructive"><AlertTitle>{issue.message}</AlertTitle><AlertDescription>{issue.guidance}</AlertDescription></Alert>;
  const nextParams = new URLSearchParams({ status: filters.status, ...(filters.startDate ? { startDate: filters.startDate } : {}), ...(filters.endDate ? { endDate: filters.endDate } : {}), ...(filters.employeeId ? { employeeId: filters.employeeId } : {}), ...(queue?.nextCursor ? { cursor: queue.nextCursor } : {}) });
  return <div className="flex flex-col gap-8"><header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-sm font-medium text-muted-foreground">Manager review</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Decide time off requests</h1><p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">The queue shows submitted requests in oldest first order. Notes stay out of the queue until you open a decision.</p></div><div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"><UsersRoundIcon aria-hidden="true" className="text-primary" /><div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Review scope</p><p className="font-semibold">{context.membership.role === "administrator" ? "Organization" : "Direct reports"}</p></div></div></header><section aria-labelledby="queue-title" className="flex flex-col gap-4"><div><h2 className="text-xl font-semibold" id="queue-title">{filters.status[0].toUpperCase() + filters.status.slice(1)} requests</h2><p className="mt-1 text-sm text-muted-foreground">{queue.rows.length} request{queue.rows.length === 1 ? "" : "s"} on this page.</p></div><Card><CardContent><form className="flex flex-wrap items-end gap-3" method="get"><Field><FieldLabel htmlFor="queue-status">Status</FieldLabel><NativeSelect defaultValue={filters.status} id="queue-status" name="status">{["submitted", "approved", "declined", "cancelled"].map((status) => <NativeSelectOption key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</NativeSelectOption>)}</NativeSelect></Field><Field><FieldLabel htmlFor="queue-start-date">From date</FieldLabel><Input defaultValue={filters.startDate} id="queue-start-date" name="startDate" type="date" /></Field><Field><FieldLabel htmlFor="queue-end-date">To date</FieldLabel><Input defaultValue={filters.endDate} id="queue-end-date" name="endDate" type="date" /></Field><Field><FieldLabel htmlFor="queue-employee-id">Employee ID</FieldLabel><Input defaultValue={filters.employeeId} id="queue-employee-id" name="employeeId" /></Field><button className={buttonVariants({ variant: "outline" })} type="submit">Apply filter</button></form></CardContent></Card>{queue.rows.length === 0 ? <Card><CardContent><Empty><EmptyHeader><EmptyMedia variant="icon"><ClipboardCheckIcon aria-hidden="true" /></EmptyMedia><EmptyTitle>No {filters.status} requests</EmptyTitle><EmptyDescription>New requests from your review scope will appear here.</EmptyDescription></EmptyHeader></Empty></CardContent></Card> : <div className="flex flex-col gap-3">{queue.rows.map((request) => <Card key={request.id}><CardHeader><CardTitle>{request.employeeName}</CardTitle><p className="text-sm text-muted-foreground">{request.employeeNumber} · {formatDateOnly(request.startDate)} to {formatDateOnly(request.endDate)} · {request.leaveType}</p></CardHeader><CardContent><Link className={buttonVariants({ variant: "outline" })} href={`/time-off/review/${request.id}`}>Review request</Link></CardContent></Card>)}{queue.nextCursor ? <Link className={buttonVariants({ variant: "outline" })} href={`/time-off/review?${nextParams.toString()}`}>Next 50 requests</Link> : null}</div>}</section></div>;
}
