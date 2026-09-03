import Link from "next/link";
import { ArrowRightIcon, CircleAlertIcon, CircleCheckBigIcon, Clock3Icon, DatabaseZapIcon, LandmarkIcon, ShieldCheckIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatInstant, formatRole } from "@/lib/hr-format";
import { cn } from "@/lib/utils";

export function WindowNav({ selected }) {
  return <nav aria-label="Operations time window" className="flex flex-wrap gap-2">
    {["today", "7d", "30d"].map((window) => <Link className={cn(buttonVariants({ variant: selected === window ? "secondary" : "outline" }), "min-h-11")} href={`/operations?window=${window}`} key={window}>{window === "today" ? "Today" : window === "7d" ? "Last 7 days" : "Last 30 days"}</Link>)}
  </nav>;
}

export function OperationsGroupUnavailable({ title }) {
  return <Alert variant="warning"><DatabaseZapIcon aria-hidden="true" /><AlertTitle>{title} is unavailable</AlertTitle><AlertDescription>This group could not be read right now. Refresh to retry; the unavailable group is not shown as zero.</AlertDescription></Alert>;
}

export function OperationsPartialNotice() {
  return <Alert variant="warning"><CircleAlertIcon aria-hidden="true" /><AlertTitle>Some operational groups need another read</AlertTitle><AlertDescription>Available groups are shown with their current data. Unavailable groups are marked in place and are not treated as empty.</AlertDescription></Alert>;
}

export function MetricCard({ description, icon: Icon, label, value, unavailable = false }) {
  return <Card size="sm"><CardHeader><span className="mb-2 flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon aria-hidden="true" /></span><CardDescription>{label}</CardDescription><CardTitle as="h3" className="text-2xl tabular-nums">{unavailable ? "Unavailable" : value}</CardTitle><CardAction><Badge variant={unavailable ? "warning" : "outline"}>{unavailable ? "Retry" : "Live"}</Badge></CardAction></CardHeader><CardContent><p className="text-sm text-muted-foreground">{description}</p></CardContent></Card>;
}

export function TrendText({ value }) {
  if (!value) return null;
  const change = value.change > 0 ? `+${value.change}` : String(value.change);
  return <span className="text-xs text-muted-foreground">{change} vs prior{value.percent === null ? " · new baseline" : ` · ${value.percent > 0 ? "+" : ""}${value.percent}%`}</span>;
}

export function HealthBadge({ result }) {
  const presentation = result === "success"
    ? { Icon: CircleCheckBigIcon, label: "Success", variant: "success" }
    : result === "unexpected_error"
      ? { Icon: CircleAlertIcon, label: "Unexpected error", variant: "destructive" }
      : { Icon: Clock3Icon, label: "Expected outcome", variant: "warning" };
  return <Badge variant={presentation.variant}><presentation.Icon aria-hidden="true" data-icon="inline-start" />{presentation.label}</Badge>;
}

export function FailureCard({ failure, timezone }) {
  return <Card size="sm"><CardHeader><CardTitle as="h3" className="break-words">{failure.safeCode}</CardTitle><CardDescription>{failure.operation}</CardDescription><CardAction><Badge variant={failure.recoveryAvailable ? "warning" : "outline"}>{failure.recoveryAvailable ? "Recovery available" : "Monitor"}</Badge></CardAction></CardHeader><CardContent className="flex flex-col gap-3"><dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Occurrences</dt><dd className="font-mono font-semibold tabular-nums">{failure.occurrenceCount}</dd></div><div><dt className="text-muted-foreground">Last seen</dt><dd>{formatInstant(failure.lastSeenAt, timezone)}</dd></div><div><dt className="text-muted-foreground">Workflow state</dt><dd>{failure.workflowStatus ?? "Not available"}</dd></div><div><dt className="text-muted-foreground">Affected record</dt><dd>{failure.affectedEntityType ?? "Not available"}</dd></div></dl>{failure.detailHref ? <Button render={<Link href={failure.detailHref} />} nativeButton={false} variant="outline">Open existing detail<ArrowRightIcon data-icon="inline-end" /></Button> : null}</CardContent></Card>;
}

export function EmptyFailures() {
  return <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><ShieldCheckIcon /></EmptyMedia><EmptyTitle>No grouped failures in this window</EmptyTitle><EmptyDescription>Operational failures will appear here with a safe code and a link to the existing workflow when recovery is available.</EmptyDescription></EmptyHeader></Empty>;
}

export function QueueCard({ queue }) {
  if (queue.state === "unavailable") return <OperationsGroupUnavailable title="Payroll queue health" />;
  return <Card><CardHeader><CardTitle>Payroll queue health</CardTitle><CardDescription>Current durable run state for this organization.</CardDescription><CardAction><LandmarkIcon aria-hidden="true" className="text-muted-foreground" /></CardAction></CardHeader><CardContent><dl className="grid grid-cols-2 gap-4 sm:grid-cols-3"><QueueValue label="Queued" value={queue.queued} /><QueueValue label="Processing" value={queue.processing} /><QueueValue label="Delayed" value={queue.delayed} /><QueueValue label="Completed" value={queue.completed} /><QueueValue label="Failed" value={queue.failed} /><QueueValue label="Retryable" value={queue.retryable} /></dl></CardContent></Card>;
}

function QueueValue({ label, value }) { return <div><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 font-mono text-xl font-semibold tabular-nums">{value ?? "Unavailable"}</dd></div>; }

export function ActorLabel({ label, role }) { return label ? <span>{label}{role ? <span className="ml-2 text-xs text-muted-foreground">{formatRole(role)}</span> : null}</span> : <span className="text-muted-foreground">System or historical actor unavailable</span>; }
