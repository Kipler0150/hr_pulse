import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheckIcon, Settings2Icon, UsersRoundIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ResponsiveRecord } from "@/components/ui/responsive-record";
import { getStatusPresentation, StatusBadge } from "@/components/ui/status-badge";
import { formatDateRange, formatMoney } from "@/lib/hr-format";
import { cn } from "@/lib/utils";
import { requireOvertimeContext } from "@/overtime/access";
import { getDefaultClosedPeriod, getTimecardReviewQueue } from "@/overtime/service";

export const metadata = { title: "Timecard review | HR Pulse" };

function hours(seconds) { return `${(seconds / 3600).toFixed(2)} h`; }

export default async function TimecardReviewPage({ searchParams }) {
  const params = await searchParams;
  const context = await requireOvertimeContext();
  if (context.membership.role === "employee") redirect("/timecards");
  const status = ["draft", "submitted", "returned", "approved"].includes(params?.status) ? params.status : "submitted";
  const defaultPeriod = await getDefaultClosedPeriod(context.organizationId, context.organization.timezone);
  const periodStart = /^\d{4}-\d{2}-\d{2}$/.test(params?.periodStart ?? "") ? params.periodStart : defaultPeriod?.periodStart;
  const periodEnd = /^\d{4}-\d{2}-\d{2}$/.test(params?.periodEnd ?? "") ? params.periodEnd : defaultPeriod?.periodEnd;
  const employeeNumber = typeof params?.employeeNumber === "string" ? params.employeeNumber.trim() : "";
  const page = await getTimecardReviewQueue(context, { status, periodStart, periodEnd, employeeNumber, cursor: params?.cursor });
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-sm font-medium text-muted-foreground">Independent time review</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Approve complete timecards</h1><p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">Review direct reports or administrator fallback work. Approved evidence becomes payroll&apos;s trusted overtime source.</p></div>
        {context.membership.role === "administrator" ? <Link className={cn(buttonVariants({ variant: "outline" }))} href="/timecards/admin"><Settings2Icon data-icon="inline-start" />Policy and corrections</Link> : null}
      </header>
      <Card>
        <CardHeader><CardTitle>Review queue</CardTitle><CardDescription>Up to 50 employees from one closed payroll period, ordered by employee number. Submitted timecards are selected by default.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-5">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <Field><FieldLabel htmlFor="employee-number">Employee number</FieldLabel><Input defaultValue={employeeNumber} id="employee-number" name="employeeNumber" /></Field>
            <Field><FieldLabel htmlFor="queue-status">Timecard status</FieldLabel><NativeSelect defaultValue={status} id="queue-status" name="status">{["submitted", "returned", "draft", "approved"].map((value) => <NativeSelectOption key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</NativeSelectOption>)}</NativeSelect></Field>
            <Field><FieldLabel htmlFor="period-start">Period start</FieldLabel><Input defaultValue={periodStart} id="period-start" name="periodStart" required type="date" /></Field>
            <Field><FieldLabel htmlFor="period-end">Period end</FieldLabel><Input defaultValue={periodEnd} id="period-end" name="periodEnd" required type="date" /></Field>
            <button className={cn(buttonVariants({ variant: "outline" }))} type="submit">Apply filter</button>
          </form>
          {page.rows.length === 0 ? <Empty><EmptyHeader><EmptyMedia variant="icon"><ClipboardCheckIcon aria-hidden="true" /></EmptyMedia><EmptyTitle>No {status} timecards</EmptyTitle><EmptyDescription>The queue will update when an employee submits or a reviewer changes a timecard.</EmptyDescription></EmptyHeader></Empty> : (
            <div className="flex flex-col gap-3">
              {page.rows.map(({ card, employee, employeeLabel }) => <ResponsiveRecord action={<Link className={cn(buttonVariants({ variant: "outline" }))} href={`/timecards/${card.id}`}>Review</Link>} key={card.id} priorityValues={[{ label: "Period", value: formatDateRange(card.periodStart, card.periodEnd) }, { label: "Worked", value: hours(card.workedSeconds) }]} secondaryValues={[{ label: "Overtime", value: hours(card.overtimeSeconds) }, { label: "Overtime earning", value: formatMoney(card.overtimeAmountMinor, card.currency) }, { label: "Status", value: <StatusBadge {...getStatusPresentation(card.status)} /> }]} title={`${employee.employeeNumber} · ${employeeLabel}`} />)}
              {page.nextCursor ? <Link className={cn(buttonVariants({ variant: "outline" }), "self-start")} href={`/timecards/review?status=${status}&employeeNumber=${encodeURIComponent(employeeNumber)}&periodStart=${periodStart}&periodEnd=${periodEnd}&cursor=${encodeURIComponent(page.nextCursor)}`}>Next 50 timecards</Link> : null}
            </div>
          )}
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle><span className="flex items-center gap-2"><UsersRoundIcon aria-hidden="true" />Review boundary</span></CardTitle><CardDescription>Managers see direct reports only. Administrators provide bounded fallback, and nobody can approve their own employee record.</CardDescription></CardHeader></Card>
    </div>
  );
}
