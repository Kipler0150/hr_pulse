"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2Icon, LockKeyholeIcon, ShieldCheckIcon } from "lucide-react";

import {
  saveProductAnalyticsConsentAction,
  submitDeletionRequestAction,
  withdrawDeletionRequestAction,
} from "@/app/actions/privacy";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

const initialState = { success: false };
const openStatuses = new Set(["submitted", "under_review"]);

function dateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC";
}

function statusLabel(value) {
  return { under_review: "Under review", submitted: "Submitted", approved: "Approved", rejected: "Rejected", scheduled: "Scheduled", completed: "Completed", failed: "Failed" }[value] ?? value;
}

function statusVariant(value) {
  if (value === "completed" || value === "approved") return "success";
  if (value === "rejected" || value === "failed") return "destructive";
  if (value === "scheduled") return "warning";
  return "information";
}

function ActionFeedback({ state, successTitle, failureTitle }) {
  if (!state?.message) return null;
  return <Alert className="mt-4" role="status" variant={state.success ? "success" : "destructive"}><AlertTitle>{state.success ? successTitle : failureTitle}</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert>;
}

export function PrivacyControls({ consent, requests }) {
  const [granted, setGranted] = useState(Boolean(consent?.granted));
  const consentKey = useRef(crypto.randomUUID());
  const requestKey = useRef(crypto.randomUUID());
  const withdrawKey = useRef(crypto.randomUUID());
  const [consentState, consentAction, consentPending] = useActionState(saveProductAnalyticsConsentAction, initialState);
  const [requestState, requestAction, requestPending] = useActionState(submitDeletionRequestAction, initialState);
  const [withdrawState, withdrawAction, withdrawPending] = useActionState(withdrawDeletionRequestAction, initialState);
  const openRequest = requests.find((request) => openStatuses.has(request.status));

  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
    <Card>
      <CardHeader className="border-b"><div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><ShieldCheckIcon aria-hidden="true" /></span><div><CardTitle>Product analytics</CardTitle><CardDescription className="mt-1">Optional usage measurement that helps the team improve HR Pulse.</CardDescription></div></div></CardHeader>
      <CardContent className="space-y-5 pt-6">
        <div className="flex items-center justify-between gap-4"><div><p className="font-medium">Current choice</p><p className="text-sm text-muted-foreground">{consent ? `Recorded ${dateTime(consent.recordedAt)} under ${consent.policyVersion}.` : "No choice has been recorded yet."}</p></div><Badge variant={consent?.granted ? "success" : "outline"}>{consent?.granted ? "On" : "Off"}</Badge></div>
        <div className="space-y-5">
          <Field orientation="horizontal"><Checkbox aria-describedby="analytics-consent-description" checked={granted} id="analytics-consent" onCheckedChange={setGranted} /><FieldLabel htmlFor="analytics-consent"><span>Allow product analytics</span></FieldLabel></Field>
          <FieldDescription id="analytics-consent-description">This choice applies to future product usage events and failure summaries. Security monitoring, audit history, and essential error reporting continue either way.</FieldDescription>
          <form action={consentAction} className="space-y-5" onSubmit={(event) => { if (consentState.success) consentKey.current = crypto.randomUUID(); event.currentTarget.elements.idempotencyKey.value = consentKey.current; }}>
            <input name="granted" type="hidden" value={granted ? "true" : "false"} />
            <input name="idempotencyKey" type="hidden" ref={(element) => { if (element) element.value = consentKey.current; }} />
            <Button disabled={consentPending} type="submit">{consentPending ? "Saving choice" : "Save analytics choice"}</Button>
          </form>
          <ActionFeedback failureTitle="Choice not saved" state={consentState} successTitle="Choice saved" />
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="border-b"><div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><LockKeyholeIcon aria-hidden="true" /></span><div><CardTitle>Deletion request</CardTitle><CardDescription className="mt-1">Request deletion of eligible privacy-controlled data tied to this identity.</CardDescription></div></div></CardHeader>
      <CardContent className="space-y-5 pt-6">
        <p className="text-sm leading-6 text-muted-foreground">Payroll, payslips, audit history, and your employee account remain preserved by this feature. No free-text explanation or attachment is collected.</p>
        {openRequest ? <div className="rounded-lg border border-border bg-muted/30 p-4"><div className="flex items-center justify-between gap-3"><p className="font-medium">Open request</p><Badge variant={statusVariant(openRequest.status)}>{statusLabel(openRequest.status)}</Badge></div><p className="mt-2 text-sm text-muted-foreground">Submitted {dateTime(openRequest.submittedAt)}.</p>{openStatuses.has(openRequest.status) ? <form action={withdrawAction} className="mt-4" onSubmit={(event) => { if (withdrawState.success) withdrawKey.current = crypto.randomUUID(); event.currentTarget.elements.idempotencyKey.value = withdrawKey.current; }}><input name="requestId" type="hidden" value={openRequest.id} /><input name="idempotencyKey" type="hidden" ref={(element) => { if (element) element.value = withdrawKey.current; }} /><Button disabled={withdrawPending} type="submit" variant="outline">{withdrawPending ? "Withdrawing request" : "Withdraw request"}</Button></form> : null}<ActionFeedback failureTitle="Request not withdrawn" state={withdrawState} successTitle="Request withdrawn" /></div> : <form action={requestAction} className="space-y-4" onSubmit={(event) => { if (requestState.success) requestKey.current = crypto.randomUUID(); event.currentTarget.elements.idempotencyKey.value = requestKey.current; }}><input name="idempotencyKey" type="hidden" ref={(element) => { if (element) element.value = requestKey.current; }} /><p className="text-sm font-medium">No open deletion request</p><Button disabled={requestPending} type="submit" variant="secondary">{requestPending ? "Submitting request" : "Submit deletion request"}</Button><ActionFeedback failureTitle="Request not submitted" state={requestState} successTitle="Request submitted" /></form>}
        {requests.length ? <div className="space-y-3 border-t border-border pt-5"><p className="text-sm font-medium">Request history</p>{requests.slice(0, 5).map((request) => <div className="flex items-center justify-between gap-3 text-sm" key={request.id}><span className="text-muted-foreground">{dateTime(request.submittedAt)}</span><Badge variant={statusVariant(request.status)}>{statusLabel(request.status)}</Badge></div>)}</div> : <Empty className="border-0 p-0"><EmptyHeader><EmptyTitle>No request history</EmptyTitle><EmptyDescription>Your request status will appear here.</EmptyDescription></EmptyHeader></Empty>}
      </CardContent>
    </Card>

    <Card className="lg:col-span-2"><CardContent className="flex flex-col gap-3 pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><p>Review the current <Link className="font-medium text-foreground underline underline-offset-4" href="/privacy">privacy notice</Link> and <Link className="font-medium text-foreground underline underline-offset-4" href="/terms">terms of use</Link>.</p><span className="inline-flex items-center gap-2"><CheckCircle2Icon aria-hidden="true" className="size-4 text-success" /> Policy-controlled and organization scoped</span></CardContent></Card>
  </div>;
}
