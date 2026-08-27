import Link from "next/link";
import { ArrowRightIcon, CircleCheckBigIcon, LandmarkIcon, Settings2Icon, UsersRoundIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { getStatusPresentation, StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { requirePayrollAdministrator } from "@/payroll/access";
import { getPayrollReleaseState } from "@/payroll/config";
import { formatPayrollMoney, formatPayrollPeriod } from "@/payroll/format";
import { getSetupChecklist, listPayrollRuns } from "@/payroll/service";

export const metadata = { title: "Payroll | HR Pulse" };

export default async function PayrollPage({ searchParams }) {
  const { cursor } = await searchParams;
  const context = await requirePayrollAdministrator();
  const [runPage, checklist] = await Promise.all([listPayrollRuns(context.organizationId, cursor), getSetupChecklist(context.organizationId, context.profile.id)]);
  const runs = runPage.rows;
  const release = getPayrollReleaseState();
  const completedSteps = Object.values(checklist).filter(Boolean).length;
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-sm font-medium text-muted-foreground">Payroll operations</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Complete payroll with a clear trail</h1><p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">Prepare fixed pay, review every deduction, and let the background worker create private payslips.</p></div>
        <Link className={cn(buttonVariants({ size: "comfortable" }))} href="/payroll/preview">Preview next payroll<ArrowRightIcon data-icon="inline-end" /></Link>
      </header>
      <Alert variant={release.enabled ? "information" : "warning"}><LandmarkIcon aria-hidden="true" /><AlertTitle>{release.enabled ? "Synthetic beta payroll" : "Payroll is disabled"}</AlertTitle><AlertDescription>{release.enabled ? "Use synthetic employee and pay data only. External transfers and regional taxes are not included." : "Set the server payroll feature switch when this environment is ready for synthetic beta use."}</AlertDescription></Alert>
      <section aria-labelledby="readiness-title">
        <div className="mb-4 flex items-end justify-between gap-4"><div><h2 className="text-xl font-semibold" id="readiness-title">Setup readiness</h2><p className="mt-1 text-sm text-muted-foreground">{completedSteps} of 5 checks complete</p></div><Link className={cn(buttonVariants({ variant: "outline" }))} href="/payroll/setup"><Settings2Icon data-icon="inline-start" />Manage setup</Link></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{Object.entries({ schedule: "Payroll schedule", administratorAccess: "Administrator access", employeePay: "Employee pay", previewReady: "Preview ready", firstPayroll: "First payroll" }).map(([key, label]) => <Card key={key} size="sm"><CardHeader><CardTitle as="h3">{label}</CardTitle><CardDescription>{checklist[key] ? "Complete" : "Needs attention"}</CardDescription></CardHeader><CardContent>{checklist[key] ? <CircleCheckBigIcon aria-label="Complete" /> : <span className="text-sm text-muted-foreground">Open setup</span>}</CardContent></Card>)}</div>
      </section>
      <section aria-labelledby="runs-title">
        <div className="mb-4 flex items-center justify-between gap-4"><div><h2 className="text-xl font-semibold" id="runs-title">Payroll runs</h2><p className="mt-1 text-sm text-muted-foreground">Newest confirmed period first</p></div><Link className={cn(buttonVariants({ variant: "outline" }))} href="/payroll/employees"><UsersRoundIcon data-icon="inline-start" />Employees</Link></div>
        {runs.length === 0 ? <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><LandmarkIcon /></EmptyMedia><EmptyTitle>No payroll runs yet</EmptyTitle><EmptyDescription>Add employee pay, then preview the most recently closed period.</EmptyDescription></EmptyHeader><EmptyContent><Button render={<Link href="/payroll/preview" />} nativeButton={false}>Preview payroll</Button></EmptyContent></Empty> : <div className="grid gap-4">{runs.map((run) => { const status = getStatusPresentation(run.status); return <Card key={run.id}><CardHeader><CardTitle as="h3">{formatPayrollPeriod(run.periodStart, run.periodEnd)}</CardTitle><CardDescription>{run.payrollReference}</CardDescription><CardAction><StatusBadge {...status} /></CardAction></CardHeader><CardContent className="flex flex-wrap items-center justify-between gap-4"><p className="font-mono text-lg font-semibold tabular-nums">{formatPayrollMoney(run.netTotalMinor, run.currency, run.currencyExponent)}</p><Link className={cn(buttonVariants({ variant: "outline" }))} href={`/payroll/runs/${run.id}`}>View run</Link></CardContent></Card>; })}{runPage.nextCursor ? <Link className={cn(buttonVariants({ variant: "outline" }), "justify-self-start")} href={`/payroll?cursor=${encodeURIComponent(runPage.nextCursor)}`}>Older runs</Link> : null}</div>}
      </section>
    </div>
  );
}
