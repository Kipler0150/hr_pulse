import { randomUUID } from "node:crypto";

import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClockIcon, HistoryIcon, ShieldCheckIcon, WrenchIcon } from "lucide-react";

import { AttendanceCorrectionForm, OvertimePolicyForm } from "@/app/(protected)/timecards/components/timecard-forms";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateOnly } from "@/lib/hr-format";
import { cn } from "@/lib/utils";
import { requireOvertimeContext } from "@/overtime/access";
import { getDefaultClosedPeriod, listOvertimePolicies } from "@/overtime/service";

export const metadata = { title: "Timecard administration | HR Pulse" };

export default async function TimecardAdminPage() {
  const context = await requireOvertimeContext();
  if (context.membership.role !== "administrator") redirect("/timecards/review");
  const [policies, period] = await Promise.all([listOvertimePolicies(context), getDefaultClosedPeriod(context.organizationId, context.organization.timezone)]);
  const latest = policies[0];
  return <div className="flex flex-col gap-8"><header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-sm font-medium text-muted-foreground">Timecard administration</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Set rules and preserve corrections</h1><p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">Create effective overtime policy versions and append narrow corrections without changing original attendance evidence.</p></div><Link className={cn(buttonVariants({ variant: "outline" }))} href="/timecards/review"><ShieldCheckIcon data-icon="inline-start" />Review queue</Link></header><Alert variant="warning"><CalendarClockIcon aria-hidden="true" /><AlertTitle>Generic configurable calculation</AlertTitle><AlertDescription>This rule does not claim compliance with any country, union agreement, or labor law.</AlertDescription></Alert><div className="grid gap-6 xl:grid-cols-2"><Card><CardHeader><CardTitle>New overtime policy version</CardTitle><CardDescription>Effective starts must align with the current payroll schedule. Earlier versions remain unchanged.</CardDescription></CardHeader><CardContent><OvertimePolicyForm latestVersion={latest?.version ?? 0} requestId={randomUUID()} suggestedDate={period?.periodStart ?? ""} /></CardContent></Card><Card><CardHeader><CardTitle><span className="flex items-center gap-2"><WrenchIcon aria-hidden="true" />Append attendance correction</span></CardTitle><CardDescription>Only completed intervals can be corrected. Submitted or approved evidence blocks the change.</CardDescription></CardHeader><CardContent><AttendanceCorrectionForm requestId={randomUUID()} /></CardContent></Card></div><Card><CardHeader><CardTitle><span className="flex items-center gap-2"><HistoryIcon aria-hidden="true" />Policy history</span></CardTitle><CardDescription>Newest effective version first. The next start derives the prior version&apos;s end.</CardDescription></CardHeader><CardContent>{policies.length === 0 ? <p className="text-sm text-muted-foreground">No policy exists yet. Add one before employees prepare timecards.</p> : <ol className="flex flex-col gap-3">{policies.map((policy, index) => <li className="rounded-xl border border-border p-4" key={policy.id}><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-medium">Version {policy.version} · {policy.enabled ? "Enabled" : "Disabled"}</p><p className="text-sm text-muted-foreground">{formatDateOnly(policy.effectiveFrom)} to {index === 0 ? "current" : formatDateOnly(policies[index - 1].effectiveFrom)}</p></div><p className="mt-2 text-sm text-muted-foreground">Daily threshold: {policy.dailyThresholdMinutes} minutes</p></li>)}</ol>}</CardContent></Card></div>;
}
