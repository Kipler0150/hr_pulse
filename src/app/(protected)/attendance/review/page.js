import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDaysIcon, CircleCheckBigIcon, SearchIcon, TriangleAlertIcon, UsersRoundIcon } from "lucide-react";

import { getAttendanceAccessState } from "@/attendance/access";
import { getAttendanceReleaseState } from "@/attendance/config";
import { serializeAttendanceError } from "@/attendance/errors";
import { getAttendanceReview } from "@/attendance/queries";
import { ApprovedLeaveMarker, AttendanceStatus, LongIntervalWarning } from "@/app/(protected)/attendance/components/attendance-status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants, Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ResponsiveRecord } from "@/components/ui/responsive-record";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatInstant } from "@/lib/hr-format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Attendance review | HR Pulse" };

export default async function AttendanceReviewPage({ searchParams }) {
  const params = await searchParams;
  const state = await getAttendanceAccessState();
  if (!state.user) redirect("/sign-in?returnTo=%2Fattendance%2Freview");
  if (!state.profile || state.profile.status !== "active") redirect("/pending-access");
  if (!state.selected) redirect("/choose-organization?returnTo=%2Fattendance%2Freview");

  let review = null;
  let issue = null;
  try {
    review = await getAttendanceReview({ cursor: params?.cursor, date: params?.date });
  } catch (error) {
    issue = serializeAttendanceError(error);
  }
  const release = getAttendanceReleaseState();
  const timezone = review?.day.timezone ?? state.selected.organization.timezone;
  const selectedDate = review?.day.date ?? (typeof params?.date === "string" ? params.date : "");

  return (
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Organization attendance</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Review the workday clearly</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">See open and completed intervals for one organization local day, with dependable ordering and clear long session warnings.</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 surface-shadow">
            <UsersRoundIcon aria-hidden="true" className="text-primary" />
            <div><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Review scope</p><p className="font-semibold">{state.selected.organization.name}</p></div>
          </div>
        </header>

        {release.enabled ? (
          <Alert variant="information">
            <CircleCheckBigIcon aria-hidden="true" />
            <AlertTitle>Synthetic attendance beta</AlertTitle>
            <AlertDescription>Attendance is enabled for synthetic internal beta data only.</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Choose an organization date</CardTitle>
            <CardDescription>The current local date is selected when you leave the field empty. Future dates are not available.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action="/attendance/review" method="get">
              <FieldGroup>
                <Field orientation="responsive">
                  <div className="min-w-44">
                    <FieldLabel htmlFor="attendance-date">Attendance date</FieldLabel>
                    <FieldDescription>Timezone: {timezone}</FieldDescription>
                  </div>
                  <Input className="min-h-11 max-w-xs" defaultValue={selectedDate} id="attendance-date" name="date" type="date" />
                  <Button size="comfortable" type="submit"><SearchIcon aria-hidden="true" data-icon="inline-start" />Review date</Button>
                </Field>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        {issue ? (
          <Alert variant={issue.retryable ? "destructive" : "warning"}>
            <TriangleAlertIcon aria-hidden="true" />
            <AlertTitle>{issue.message}</AlertTitle>
            <AlertDescription>{issue.guidance}</AlertDescription>
          </Alert>
        ) : (
          <section aria-labelledby="records-title" className="flex flex-col gap-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold" id="records-title">Daily attendance</h2>
                <p className="mt-1 text-sm text-muted-foreground">Intervals that started on {review.day.date} in {timezone}</p>
              </div>
              <p className="text-sm font-medium tabular-nums text-muted-foreground">{review.rows.length} record{review.rows.length === 1 ? "" : "s"} on this page</p>
              </div>

              {!review.leave.available ? <Alert variant="warning"><TriangleAlertIcon aria-hidden="true" /><AlertTitle>Leave data is temporarily unavailable</AlertTitle><AlertDescription>Attendance is current, but approved leave markers and conflict warnings are hidden until leave data loads again.</AlertDescription></Alert> : null}
              {review.leave.markers.map((marker) => <ApprovedLeaveMarker includeEmployee key={marker.id} marker={marker} />)}

            {review.rows.length === 0 ? (
              <Card>
                <CardContent>
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon"><CalendarDaysIcon aria-hidden="true" /></EmptyMedia>
                      <EmptyTitle>No attendance for this date</EmptyTitle>
                      <EmptyDescription>Choose another organization date or check again after employees record work.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-xl border border-border md:block">
                  <Table containerLabel="Organization daily attendance">
                    <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Check in</TableHead><TableHead>Clock out</TableHead><TableHead>Duration</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {review.rows.map((interval) => (
                        <TableRow key={interval.id}>
                          <TableCell className="font-medium">{interval.employeeName}</TableCell>
                          <TableCell><time dateTime={interval.clockIn}>{formatInstant(interval.clockIn, timezone)}</time></TableCell>
                          <TableCell>{interval.clockOut ? <time dateTime={interval.clockOut}>{formatInstant(interval.clockOut, timezone)}</time> : "In progress"}</TableCell>
                          <TableCell className="tabular-nums">{interval.duration}</TableCell>
                          <TableCell><div className="flex flex-col items-start gap-2"><AttendanceStatus interval={interval} />{interval.longInterval ? <span className="text-xs font-medium text-warning">Long interval</span> : null}</div></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex flex-col gap-3 md:hidden">
                  {review.rows.map((interval) => (
                    <div className="flex flex-col gap-3" key={interval.id}>
                      <ResponsiveRecord
                        action={<AttendanceStatus interval={interval} />}
                        priorityValues={[{ label: "Check in", value: formatInstant(interval.clockIn, timezone) }, { label: "Duration", value: interval.duration }]}
                        secondaryValues={[{ label: "Clock out", value: interval.clockOut ? formatInstant(interval.clockOut, timezone) : "In progress" }, { label: "Organization time", value: timezone }]}
                        title={interval.employeeName}
                      />
                      {interval.longInterval ? <LongIntervalWarning /> : null}
                    </div>
                  ))}
                </div>
              </>
            )}

            <nav aria-label="Attendance pages" className="flex flex-wrap justify-end gap-3">
              {params?.cursor ? <Link className={cn(buttonVariants({ size: "comfortable", variant: "outline" }))} href={`/attendance/review?date=${encodeURIComponent(review.day.date)}`}>First page</Link> : null}
              {review.nextCursor ? <Link className={cn(buttonVariants({ size: "comfortable", variant: "outline" }))} href={`/attendance/review?date=${encodeURIComponent(review.day.date)}&cursor=${encodeURIComponent(review.nextCursor)}`}>Next 50 records</Link> : null}
            </nav>
          </section>
        )}
      </div>
  );
}
