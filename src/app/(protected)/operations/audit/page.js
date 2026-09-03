import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon, ClipboardListIcon, FilterIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatInstant } from "@/lib/hr-format";
import { AUDIT_ACTION_CATALOG, AUDIT_ENTITY_TYPE_CATALOG } from "@/product-operations/catalog";
import { ProductOperationsError } from "@/product-operations/errors";
import { getAuditHistory } from "@/product-operations/queries";
import { cn } from "@/lib/utils";
import { ActorLabel } from "../components/operations-ui";

export const metadata = { title: "Audit history | HR Pulse" };

function searchValue(params, key) {
  const value = params?.[key];
  return Array.isArray(value) ? value[0] : value ?? "";
}

function auditHref(filters, cursor = null) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
  if (cursor) query.set("cursor", cursor);
  const encoded = query.toString();
  return encoded ? `/operations/audit?${encoded}` : "/operations/audit";
}

function ResultBadge({ result }) {
  const variant = result === "success" ? "success" : result === "denied" || result === "unexpected_error" ? "destructive" : "warning";
  return <Badge variant={variant}>{result.replaceAll("_", " ")}</Badge>;
}

export default async function AuditHistoryPage({ searchParams }) {
  const params = await searchParams;
  let history;
  let error = null;
  try { history = await getAuditHistory(params); } catch (cause) { error = cause instanceof ProductOperationsError ? cause : new ProductOperationsError("AUDIT_FILTER_INVALID"); }
  const currentFilters = history?.filters ?? {
    from: searchValue(params, "from"), to: searchValue(params, "to"), actorProfileId: searchValue(params, "actorProfileId"), action: searchValue(params, "action"), entityType: searchValue(params, "entityType"), result: searchValue(params, "result"),
  };
  return <div className="flex flex-col gap-8">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><Link className={cn(buttonVariants({ variant: "link" }), "-ml-2 mb-2 min-h-11 px-2")} href="/operations"><ArrowLeftIcon data-icon="inline-start" />Operations overview</Link><p className="text-sm font-medium text-muted-foreground">Traceable change history</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Audit history</h1><p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">Review important changes and access outcomes for the selected organization. Routine reads stay out of this trail.</p></div><Badge className="h-7" variant="information"><ClipboardListIcon data-icon="inline-start" />Newest first</Badge></header>
    <Card><CardHeader><CardTitle><FilterIcon data-icon="inline-start" />Filter the trail</CardTitle><CardDescription>Use a maximum 90-day range. Empty fields keep the safe 30-day default.</CardDescription></CardHeader><CardContent><form className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" method="get"><Field label="From"><Input aria-label="From date" name="from" type="date" defaultValue={currentFilters.from ?? ""} /></Field><Field label="To"><Input aria-label="To date" name="to" type="date" defaultValue={currentFilters.to ?? ""} /></Field><Field label="Actor profile ID"><Input aria-label="Actor profile ID" name="actorProfileId" placeholder="Optional UUID" defaultValue={currentFilters.actorProfileId ?? ""} /></Field><Field label="Action"><NativeSelect aria-label="Action" name="action" defaultValue={currentFilters.action ?? ""}><NativeSelectOption value="">All actions</NativeSelectOption>{AUDIT_ACTION_CATALOG.map((action) => <NativeSelectOption key={action} value={action}>{action}</NativeSelectOption>)}</NativeSelect></Field><Field label="Entity type"><NativeSelect aria-label="Entity type" name="entityType" defaultValue={currentFilters.entityType ?? ""}><NativeSelectOption value="">All entities</NativeSelectOption>{AUDIT_ENTITY_TYPE_CATALOG.map((entity) => <NativeSelectOption key={entity} value={entity}>{entity.replaceAll("_", " ")}</NativeSelectOption>)}</NativeSelect></Field><Field label="Result"><NativeSelect aria-label="Result" name="result" defaultValue={currentFilters.result ?? ""}><NativeSelectOption value="">All results</NativeSelectOption><NativeSelectOption value="success">Success</NativeSelectOption><NativeSelectOption value="expected_error">Expected error</NativeSelectOption><NativeSelectOption value="unexpected_error">Unexpected error</NativeSelectOption><NativeSelectOption value="denied">Denied</NativeSelectOption></NativeSelect></Field><div className="flex items-end gap-2 md:col-span-2 xl:col-span-3"><Button className="min-h-11" type="submit">Apply filters</Button><Link className={cn(buttonVariants({ variant: "outline" }), "min-h-11")} href="/operations/audit">Clear</Link></div></form></CardContent></Card>
    {error ? <Alert variant="destructive"><FilterIcon aria-hidden="true" /><AlertTitle>Filters could not be applied</AlertTitle><AlertDescription>{error.message} Return to the default trail or correct the highlighted filter values.</AlertDescription></Alert> : null}
    <section aria-labelledby="events-title"><div className="mb-4 flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-xl font-semibold" id="events-title">Recorded events</h2><p className="mt-1 text-sm text-muted-foreground">{history ? `${history.rows.length} events shown · ${history.timezone}` : "No events available"}</p></div></div>{history && history.rows.length > 0 ? <div className="rounded-xl border border-border"><Table containerLabel="Scrollable audit events"><caption className="p-4 text-left text-sm text-muted-foreground">Safe audit fields only. Open a row for the complete reviewed event contract.</caption><TableHeader><TableRow><TableHead scope="col">When</TableHead><TableHead scope="col">Action</TableHead><TableHead scope="col">Actor</TableHead><TableHead scope="col">Entity</TableHead><TableHead scope="col">Result</TableHead><TableHead scope="col"><span className="sr-only">Details</span></TableHead></TableRow></TableHeader><TableBody>{history.rows.map((event) => <TableRow key={event.id}><TableCell><time dateTime={event.createdAt.toISOString()}>{formatInstant(event.createdAt, history.timezone)}</time></TableCell><TableCell><span className="font-medium">{event.action}</span><span className="mt-1 block font-mono text-xs text-muted-foreground">{event.id.slice(0, 8)}…</span></TableCell><TableCell><ActorLabel label={event.actorLabel} role={event.actorRole} /></TableCell><TableCell><span className="capitalize">{event.entityType.replaceAll("_", " ")}</span><span className="mt-1 block font-mono text-xs text-muted-foreground">{event.entityId.slice(0, 8)}…</span></TableCell><TableCell><ResultBadge result={event.result} /></TableCell><TableCell><Link className={cn(buttonVariants({ variant: "outline", size: "sm" }))} href={`/operations/audit/${event.id}`}>Details<ArrowRightIcon data-icon="inline-end" /></Link></TableCell></TableRow>)}</TableBody></Table></div> : <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><ClipboardListIcon /></EmptyMedia><EmptyTitle>{error ? "No events to show" : "No audit events in this range"}</EmptyTitle><EmptyDescription>{error ? "Reset the filters to read the default 30-day trail." : "Important changes will appear here as administrators and trusted workflows make them."}</EmptyDescription></EmptyHeader></Empty>}{history?.nextCursor ? <div className="mt-4"><Link className={cn(buttonVariants({ variant: "outline", size: "comfortable" }))} href={auditHref(history.filters, history.nextCursor)}>Older events<ArrowRightIcon data-icon="inline-end" /></Link></div> : null}</section>
  </div>;
}

function Field({ children, label }) { return <label className="flex min-h-20 flex-col gap-2 text-sm font-medium">{label}{children}</label>; }
