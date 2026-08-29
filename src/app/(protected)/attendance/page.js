import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClockIcon, CircleCheckBigIcon, Clock3Icon, HistoryIcon, TriangleAlertIcon } from "lucide-react";

import { getAttendanceAccessState } from "@/attendance/access";
import { getAttendanceReleaseState } from "@/attendance/config";
import { serializeAttendanceError } from "@/attendance/errors";
import { getEmployeeAttendance } from "@/attendance/queries";
import { AttendanceActionForm } from "@/app/(protected)/attendance/components/attendance-action-form";
import { AttendanceStatus, LongIntervalWarning } from "@/app/(protected)/attendance/components/attendance-status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ResponsiveRecord } from "@/components/ui/responsive-record";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatInstant } from "@/lib/hr-format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Attendance | HR Pulse" };

function AttendanceIssue({ issue }) {
  return (
    <Alert variant={issue.retryable ? "destructive" : "warning"}>
      <TriangleAlertIcon aria-hidden="true" />
      <AlertTitle>{issue.message}</AlertTitle>
      <AlertDescription>{issue.guidance}</AlertDescription>
    </Alert>
  );
}

export default async function AttendancePage({ searchParams }) {
  const params = await searchParams;
  const state = await getAttendanceAccessState();
  if (!state.user) redirect("/sign-in?returnTo=%2Fattendance");
  if (!state.profile || state.profile.status !== "active") redirect("/pending-access");
  if (!state.selected) redirect("/choose-organization?returnTo=%2Fattendance");

  let attendance = null;
  let issue = null;
  try {
    attendance = await getEmployeeAttendance({ cursor: params?.cursor });
  } catch (error) {
    issue = serializeAttendanceError(error);
  }
  const release = getAttendanceReleaseState();
  const timezone = attendance?.day.timezone ?? state.selected.organization.timezone;
  const openInterval = attendance?.openInterval ?? null;

  return (
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Your organization workday</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Check in with confidence</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">Record one trusted work interval at a time. HR Pulse uses database time and keeps your current state clear after every reload.</p>
          </div>
          <AttendanceStatus interval={openInterval} />
        </header>

        {release.enabled ? (
          <Alert variant="information">
            <CircleCheckBigIcon aria-hidden="true" />
            <AlertTitle>Synthetic attendance beta</AlertTitle>
            <AlertDescription>Attendance is enabled for synthetic internal beta data only.</AlertDescription>
          </Alert>
        ) : null}

        {issue ? <AttendanceIssue issue={issue} /> : (
          <>
            <section aria-labelledby="current-state-title" className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
              <Card>
                <CardHeader>
                  <CardDescription>Current attendance state</CardDescription>
                  <CardTitle id="current-state-title">{openInterval ? "You are checked in" : "You are checked out"}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  <div className="rounded-xl border border-border bg-muted/40 p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Current session</p>
                    <p className="mt-2 text-lg font-semibold tabular-nums">
                      {openInterval ? `Started ${formatInstant(openInterval.clockIn, timezone)}` : "Ready for your next work session"}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">Times are recorded by the database for {timezone}.</p>
                  </div>
                  <AttendanceActionForm mode={openInterval ? "clock-out" : "check-in"} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardDescription>Reliable by design</CardDescription>
                  <CardTitle as="h2">One open interval</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col gap-4 text-sm leading-6 text-muted-foreground">
                    <li className="flex gap-3"><Clock3Icon aria-hidden="true" className="mt-1 shrink-0 text-primary" />A repeated action cannot create a second open session.</li>
                    <li className="flex gap-3"><HistoryIcon aria-hidden="true" className="mt-1 shrink-0 text-primary" />Reloading always shows the committed database state.</li>
                    <li className="flex gap-3"><CalendarClockIcon aria-hidden="true" className="mt-1 shrink-0 text-primary" />Daily history follows the organization timezone.</li>
                  </ul>
                </CardContent>
              </Card>
            </section>

            <section aria-labelledby="today-title" className="flex flex-col gap-4">
              <div>
                <h2 className="text-xl font-semibold" id="today-title">Today&apos;s intervals</h2>
                <p className="mt-1 text-sm text-muted-foreground">Work sessions that started on {attendance.day.date} in {timezone}</p>
              </div>
              {attendance.rows.length === 0 ? (
                <Card>
                  <CardContent>
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon"><CalendarClockIcon aria-hidden="true" /></EmptyMedia>
                        <EmptyTitle>No attendance intervals yet</EmptyTitle>
                        <EmptyDescription>Your first check in for this organization day will appear here.</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="hidden overflow-hidden rounded-xl border border-border md:block">
                    <Table containerLabel="Today attendance intervals">
                      <TableHeader><TableRow><TableHead>Check in</TableHead><TableHead>Clock out</TableHead><TableHead>Duration</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {attendance.rows.map((interval) => (
                          <TableRow key={interval.id}>
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
                    {attendance.rows.map((interval) => (
                      <div className="flex flex-col gap-3" key={interval.id}>
                        <ResponsiveRecord
                          action={<AttendanceStatus interval={interval} />}
                          priorityValues={[{ label: "Check in", value: formatInstant(interval.clockIn, timezone) }, { label: "Duration", value: interval.duration }]}
                          secondaryValues={[{ label: "Clock out", value: interval.clockOut ? formatInstant(interval.clockOut, timezone) : "In progress" }, { label: "Organization time", value: timezone }]}
                          title="Work interval"
                        />
                        {interval.longInterval ? <LongIntervalWarning /> : null}
                      </div>
                    ))}
                  </div>
                </>
              )}
              {attendance.nextCursor ? (
                <div className="flex justify-end">
                  <Link className={cn(buttonVariants({ size: "comfortable", variant: "outline" }))} href={`/attendance?cursor=${encodeURIComponent(attendance.nextCursor)}`}>View earlier intervals</Link>
                </div>
              ) : null}
            </section>
          </>
        )}
      </div>
  );
}
