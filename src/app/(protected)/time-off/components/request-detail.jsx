import { CalendarDaysIcon, HistoryIcon, UserRoundIcon } from "lucide-react";

import { CancelRequest, ReviewActions } from "./time-off-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, getStatusPresentation } from "@/components/ui/status-badge";
import { formatDateOnly, formatInstant } from "@/lib/hr-format";

function eventLabel(event) {
  if (event.action === "submitted") return "Submitted";
  if (event.action === "approved") return "Approved";
  if (event.action === "declined") return "Declined";
  return "Cancelled";
}

export function RequestDetail({ detail, context, reviewer = false }) {
  const request = detail.request;
  const events = detail.events ?? [];
  const timezone = context.timezone;
  const permissions = detail.permissions ?? {};
  const canCancel = permissions.can_cancel === true;
  const canApprove = permissions.can_approve === true;
  const canDecline = permissions.can_decline === true;
  const currentLate = detail.currentLate === true;
  const terminalEvent = events.find((event) => event.action !== "submitted");
  const trustedLate = terminalEvent?.was_late === true;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{reviewer ? "Manager review" : "Your time off request"}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{formatDateOnly(request.start_date)} to {formatDateOnly(request.end_date)}</h1>
          <p className="mt-3 text-base text-muted-foreground">{request.leave_type} time off, {request.end_date === request.start_date ? "one calendar day" : "inclusive calendar dates"}.</p>
        </div>
        <StatusBadge {...getStatusPresentation(request.status)} />
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle><CalendarDaysIcon aria-hidden="true" data-icon="inline-start" />Request context</CardTitle><CardDescription>Dates are stored as organization calendar dates.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {reviewer ? <p><span className="font-medium">Employee:</span> {detail.employeeLabel || "Former user"} ({detail.employeeNumber || "No employee number"})</p> : null}
            <p><span className="font-medium">Type:</span> {request.leave_type}</p>
            <p><span className="font-medium">Reason:</span> {request.reason || "Not provided"}</p>
            <p><span className="font-medium">Version:</span> {request.version}</p>
            {currentLate || trustedLate ? <p className="text-amber-700 dark:text-amber-300">This request is late.</p> : null}
            <p><span className="font-medium">Reviewer guidance:</span> {detail.reviewerAvailability || "reviewer_needed"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle><UserRoundIcon aria-hidden="true" data-icon="inline-start" />Decision</CardTitle><CardDescription>The current state is authoritative.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            {request.decision_at ? <p>Decided {formatInstant(request.decision_at, timezone)}.</p> : request.cancelled_at ? <p>Cancelled {formatInstant(request.cancelled_at, timezone)}.</p> : <p>No decision has been made yet.</p>}
            {canCancel ? <CancelRequest expectedVersion={request.version} requestId={request.id} /> : null}
            {canApprove || canDecline ? <ReviewActions canApprove={canApprove} canDecline={canDecline} expectedVersion={request.version} requestId={request.id} /> : null}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader><CardTitle><HistoryIcon aria-hidden="true" data-icon="inline-start" />Workflow history</CardTitle><CardDescription>Committed events appear in their trusted occurrence order.</CardDescription></CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-4">{events.map((event) => <li className="rounded-xl border border-border p-4" key={event.id}><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-medium">{eventLabel(event)}</p><time className="text-sm text-muted-foreground" dateTime={event.occurred_at}>{formatInstant(event.occurred_at, timezone)}</time></div><p className="mt-2 text-sm text-muted-foreground">{event.actor_display_label || "Former user"}, {event.actor_role} reviewer</p>{event.decision_note ? <p className="mt-3 whitespace-pre-wrap text-sm">{event.decision_note}</p> : null}{event.fallback_reason ? <p className="mt-3 whitespace-pre-wrap text-sm">{event.fallback_reason}</p> : null}</li>)}</ol>
        </CardContent>
      </Card>
    </div>
  );
}
