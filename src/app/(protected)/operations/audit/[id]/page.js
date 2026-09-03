import Link from "next/link";
import { ArrowLeftIcon, CircleAlertIcon, CircleCheckBigIcon, FingerprintIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatInstant, formatRole } from "@/lib/hr-format";
import { ProductOperationsError } from "@/product-operations/errors";
import { getAuditEventDetail } from "@/product-operations/queries";
import { cn } from "@/lib/utils";

export const metadata = { title: "Audit event | HR Pulse" };

export default async function AuditEventPage({ params }) {
  const { id } = await params;
  let event;
  try { event = await getAuditEventDetail(id); } catch (error) { if (error instanceof ProductOperationsError && error.code === "AUDIT_EVENT_NOT_FOUND") notFound(); throw error; }
  const isSuccess = event.result === "success";
  return <div className="flex flex-col gap-8">
    <header><Link className={cn(buttonVariants({ variant: "link" }), "-ml-2 mb-3 min-h-11 px-2")} href="/operations/audit"><ArrowLeftIcon data-icon="inline-start" />Back to audit history</Link><p className="text-sm font-medium text-muted-foreground">Safe event detail</p><div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="break-words text-3xl font-semibold tracking-tight">{event.action}</h1><Badge variant={isSuccess ? "success" : event.result === "denied" || event.result === "unexpected_error" ? "destructive" : "warning"}>{event.result.replaceAll("_", " ")}</Badge></div><p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">One immutable record from the selected organization. Sensitive request, payroll, employee, and technical details are intentionally excluded.</p></header>
    {!isSuccess ? <Alert variant={event.result === "unexpected_error" || event.result === "denied" ? "destructive" : "warning"}><CircleAlertIcon aria-hidden="true" /><AlertTitle>This event needs context</AlertTitle><AlertDescription>Use the action, safe reason codes, and correlation identifier with protected operations access. No raw exception or request detail is stored here.</AlertDescription></Alert> : <Alert variant="success"><CircleCheckBigIcon aria-hidden="true" /><AlertTitle>Immutable event record</AlertTitle><AlertDescription>The event was appended by a trusted server boundary and cannot be edited through normal operations.</AlertDescription></Alert>}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]"><Card><CardHeader><CardTitle>Event contract</CardTitle><CardDescription>Values shown are reviewed safe fields.</CardDescription></CardHeader><CardContent><dl className="grid gap-5 sm:grid-cols-2"><Detail label="Action" value={event.action} /><Detail label="Entity type" value={event.entityType.replaceAll("_", " ")} /><Detail label="Opaque entity ID" value={event.entityId} mono /><Detail label="Result" value={event.result.replaceAll("_", " ")} /><Detail label="Actor" value={event.actorLabel ?? "System or historical actor unavailable"} /><Detail label="Actor role" value={event.actorRole ? formatRole(event.actorRole) : "Not available"} /><Detail label="Trusted time" value={formatInstant(event.createdAt, "UTC")} /><Detail label="Correlation ID" value={event.correlationId ?? "Not available for this historical record"} mono /></dl></CardContent></Card><Card><CardHeader><span className="mb-2 flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground"><FingerprintIcon aria-hidden="true" /></span><CardTitle>Safe context</CardTitle><CardDescription>Only reviewed change evidence is shown.</CardDescription></CardHeader><CardContent><dl className="flex flex-col gap-4"><Detail label="Resulting version" value={event.resultingVersion ?? "Not recorded"} mono /><Detail label="Changed fields" value={event.changedFields.length ? event.changedFields.join(", ") : "None recorded"} /><Detail label="Reason codes" value={event.reasonCodes.length ? event.reasonCodes.join(", ") : "None recorded"} /></dl></CardContent></Card></div>
  </div>;
}

function Detail({ label, mono = false, value }) { return <div className="min-w-0"><dt className="text-sm text-muted-foreground">{label}</dt><dd className={cn("mt-1 break-words", mono && "font-mono text-sm")}>{value}</dd></div>; }
