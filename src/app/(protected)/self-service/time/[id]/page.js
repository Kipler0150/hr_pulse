import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveRecord } from "@/components/ui/responsive-record";
import { formatDateOnly, formatDateRange } from "@/lib/hr-format";
import { cn } from "@/lib/utils";
import { requireSelfServiceContext } from "@/self-service/access";
import { SelfServiceError } from "@/self-service/errors";
import { getApprovedTimecard } from "@/self-service/queries";

const hours = (seconds) => `${(seconds / 3600).toFixed(2)} h`;
export const metadata = { title: "Approved time evidence | HR Pulse" };

export default async function SelfServiceTimeDetailPage({ params }) {
  const context = await requireSelfServiceContext();
  const { id } = await params;
  let detail;
  try {
    detail = await getApprovedTimecard(context, id);
  } catch (error) { if (error instanceof SelfServiceError && error.code === "SELF_SERVICE_NOT_FOUND") notFound(); throw error; }
  const { card, days, sources } = detail;
  const displayTimestamp = (value) => value ? new Date(value).toLocaleString("en-PH", { timeZone: card.timezone }) : "Not recorded";
  return <div className="flex flex-col gap-8"><header><Link className={cn(buttonVariants({ variant: "ghost" }), "-ml-3")} href="/self-service/time">Approved time</Link><p className="mt-4 text-sm font-medium text-muted-foreground">Immutable evidence</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{formatDateRange(card.periodStart, card.periodEnd)}</h1><p className="mt-3 text-base text-muted-foreground">Approved in {card.timezone}. This record cannot be edited from self service.</p></header><section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Timecard totals">{[["Worked", hours(card.workedSeconds)], ["Regular", hours(card.regularSeconds)], ["Overtime", hours(card.overtimeSeconds)], ["Payable overtime", `${card.payableOvertimeMinutes} min`]].map(([label, value]) => <Card key={label} size="sm"><CardHeader><CardDescription>{label}</CardDescription><CardTitle>{value}</CardTitle></CardHeader></Card>)}</section><Card><CardHeader><CardTitle>Daily evidence</CardTitle><CardDescription>Stored period totals and attendance source snapshots.</CardDescription></CardHeader><CardContent><div className="flex flex-col gap-3">{days.map((day) => <ResponsiveRecord key={day.id} title={formatDateOnly(day.localDate)} priorityValues={[{ label: "Worked", value: hours(day.workedSeconds) }, { label: "Overtime", value: hours(day.overtimeSeconds) }]} secondaryValues={[{ label: "Regular", value: hours(day.regularSeconds) }, { label: "Payable overtime", value: `${day.payableOvertimeMinutes} min` }, { label: "Sources", value: String(sources.filter((source) => source.timecardDayId === day.id).length) }]} />)}</div></CardContent></Card><Card><CardHeader><CardTitle>Attendance source snapshots</CardTitle><CardDescription>Clock events retained on this approved timecard.</CardDescription></CardHeader><CardContent><div className="flex flex-col gap-3">{sources.length ? sources.map((source, index) => <ResponsiveRecord key={`${source.timecardDayId}-${index}`} title={`Source ${index + 1}`} priorityValues={[{ label: "Clock in", value: displayTimestamp(source.clockInSnapshot) }, { label: "Clock out", value: displayTimestamp(source.clockOutSnapshot) }]} secondaryValues={[{ label: "Allocated", value: `${source.allocatedSeconds} sec` }]} />) : <p className="text-sm text-muted-foreground">No attendance source snapshots are attached.</p>}</div></CardContent></Card><Card><CardHeader><CardTitle>Policy and pay evidence</CardTitle></CardHeader><CardContent><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><div><dt className="text-sm text-muted-foreground">Policy version</dt><dd className="font-medium">{card.policyVersion}</dd></div><div><dt className="text-sm text-muted-foreground">Daily threshold</dt><dd className="font-medium">{card.dailyThresholdMinutes} min</dd></div><div><dt className="text-sm text-muted-foreground">Overtime eligible</dt><dd className="font-medium">{card.overtimeEligible ? "Yes" : "No"}</dd></div><div><dt className="text-sm text-muted-foreground">Currency</dt><dd className="font-medium">{card.currency}</dd></div><div><dt className="text-sm text-muted-foreground">Overtime amount</dt><dd className="font-medium">{card.overtimeAmountMinor} minor units</dd></div></dl></CardContent></Card></div>;
}
