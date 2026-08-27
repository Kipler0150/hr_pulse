import Link from "next/link";
import { Clock3Icon, RotateCcwIcon, SendIcon, ShieldAlertIcon } from "lucide-react";
import { recoverPayrollAction, resubmitPayrollAction, retryPayrollAction } from "@/app/actions/payroll";
import { validateUuid } from "@/db/validation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveRecord } from "@/components/ui/responsive-record";
import { getStatusPresentation, StatusBadge } from "@/components/ui/status-badge";
import { requirePayrollAdministrator } from "@/payroll/access";
import { formatPayrollMoney, formatPayrollPeriod } from "@/payroll/format";
import { getPayrollRun } from "@/payroll/service";
import { PayslipDownload } from "../../components/payslip-download";
import { RunPolling } from "../../components/run-polling";

export const metadata = { title: "Payroll run | HR Pulse" };

export default async function PayrollRunPage({ params, searchParams }) {
  const { id } = await params;
  const { cursor } = await searchParams;
  const runId = validateUuid(id, "runId");
  const context = await requirePayrollAdministrator();
  const detail = await getPayrollRun(context.organizationId, runId, cursor);
  const status = getStatusPresentation(detail.run.status);
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="break-words text-sm font-medium text-muted-foreground">{detail.run.payrollReference}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{formatPayrollPeriod(detail.run.periodStart, detail.run.periodEnd)}</h1><p className="mt-3 text-base text-muted-foreground">Confirmed with calculation {detail.run.calculationVersion}.</p></div><StatusBadge {...status} /></header>
      {detail.delayed ? <Alert variant="warning"><Clock3Icon aria-hidden="true" /><AlertTitle>Processing is delayed</AlertTitle><AlertDescription>{detail.recoveryEligible ? "The worker lease has expired. You may recover this run before retrying it." : "The worker still owns an active lease. HR Pulse will keep checking for progress."}</AlertDescription></Alert> : null}
      {detail.run.errorCode ? <Alert variant="destructive"><ShieldAlertIcon aria-hidden="true" /><AlertTitle>{detail.run.errorCode}</AlertTitle><AlertDescription>{detail.run.errorGuidance}</AlertDescription></Alert> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card><CardHeader><CardTitle>Run totals</CardTitle><CardDescription>Frozen integer minor unit values across every payout</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-3"><Total label="Gross" value={formatPayrollMoney(detail.run.grossTotalMinor, detail.run.currency, detail.run.currencyExponent)} /><Total label="Deductions" value={formatPayrollMoney(detail.run.deductionsTotalMinor, detail.run.currency, detail.run.currencyExponent)} /><Total label="Net amount owed" value={formatPayrollMoney(detail.run.netTotalMinor, detail.run.currency, detail.run.currencyExponent)} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Processing control</CardTitle><CardDescription>Polling preserves the last known state during network errors.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3"><RunPolling initialStatus={detail.run.status} runId={runId} />{detail.run.status === "queued" && detail.run.queueStatus !== "submitted" ? <form action={resubmitPayrollAction}><input name="runId" type="hidden" value={runId} /><Button type="submit"><SendIcon data-icon="inline-start" />Resubmit queued run</Button></form> : null}{detail.recoveryEligible ? <form action={recoverPayrollAction}><input name="runId" type="hidden" value={runId} /><Button type="submit" variant="destructive"><ShieldAlertIcon data-icon="inline-start" />Recover delayed run</Button></form> : null}{detail.run.status === "failed" ? <form action={retryPayrollAction}><input name="runId" type="hidden" value={runId} /><Button type="submit"><RotateCcwIcon data-icon="inline-start" />Retry frozen run</Button></form> : null}</CardContent></Card>
      </div>
      <section aria-labelledby="payouts-title"><div className="mb-4"><h2 className="text-xl font-semibold" id="payouts-title">Payouts and payslips</h2><p className="mt-1 text-sm text-muted-foreground">Finalized means calculated and locked, not externally transferred.</p></div><div className="flex flex-col gap-3">{detail.payouts.map(({ payout, payslip }) => <ResponsiveRecord action={payslip?.status === "generated" ? <PayslipDownload payslipId={payslip.id} /> : <Badge variant="outline">Payslip {payslip?.status ?? "pending"}</Badge>} key={payout.id} priorityValues={[{ label: "Employee number", value: payout.employeeNumber }, { label: "Net owed", value: formatPayrollMoney(payout.netAmountMinor, payout.currency, payout.currencyExponent) }]} secondaryValues={[{ label: "Gross", value: formatPayrollMoney(payout.grossAmountMinor, payout.currency, payout.currencyExponent) }, { label: "Deductions", value: formatPayrollMoney(payout.deductionsAmountMinor, payout.currency, payout.currencyExponent) }]} title={payout.legalName} />)}{detail.payoutNextCursor ? <Link className={buttonVariants({ variant: "outline" })} href={`/payroll/runs/${runId}?cursor=${encodeURIComponent(detail.payoutNextCursor)}`}>More payouts</Link> : null}</div></section>
      <section aria-labelledby="attempts-title"><h2 className="mb-4 text-xl font-semibold" id="attempts-title">Attempt history</h2><div className="grid gap-3 md:grid-cols-2">{detail.attempts.length ? detail.attempts.map((attempt) => <Card key={attempt.id} size="sm"><CardHeader><CardTitle as="h3">Generation {attempt.processingGeneration}, attempt {attempt.attemptNumber}</CardTitle><CardDescription>{attempt.startedAt.toISOString()}</CardDescription><CardAction><Badge variant="outline">{attempt.outcome}</Badge></CardAction></CardHeader>{attempt.errorCode ? <CardContent><p className="text-sm text-muted-foreground">{attempt.errorCode}: {attempt.errorGuidance}</p></CardContent> : null}</Card>) : <p className="text-sm text-muted-foreground">No worker attempt has started yet.</p>}</div></section>
    </div>
  );
}

function Total({ label, value }) {
  return <div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 font-mono text-lg font-semibold tabular-nums">{value}</p></div>;
}
