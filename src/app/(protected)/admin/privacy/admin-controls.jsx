"use client";

import { useActionState, useRef, useState } from "react";
import { LockKeyholeIcon, ShieldCheckIcon } from "lucide-react";

import { changePrivacyHoldAction, decideDeletionRequestAction, startDeletionRequestReviewAction } from "@/app/actions/privacy";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

const initialState = { success: false };

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

function RequestDecision({ request }) {
  const [state, action, pending] = useActionState(decideDeletionRequestAction, initialState);
  const key = useRef(crypto.randomUUID());
  const canDecide = request.status === "under_review";
  const submit = (event) => { if (state.success) key.current = crypto.randomUUID(); event.currentTarget.elements.idempotencyKey.value = key.current; };
  if (!canDecide) return null;
  return <div className="flex flex-wrap gap-2"><form action={action} onSubmit={submit}><input name="requestId" type="hidden" value={request.id} /><input name="decision" type="hidden" value="approved" /><input name="idempotencyKey" type="hidden" ref={(element) => { if (element) element.value = key.current; }} /><Button disabled={pending} size="sm" type="submit">Approve</Button></form><form action={action} onSubmit={submit}><input name="requestId" type="hidden" value={request.id} /><input name="decision" type="hidden" value="rejected" /><input name="idempotencyKey" type="hidden" ref={(element) => { if (element) element.value = key.current; }} /><Button disabled={pending} size="sm" type="submit" variant="outline">Reject</Button></form>{state.message ? <p className={state.success ? "w-full text-sm text-success" : "w-full text-sm text-destructive"} role="status">{state.message}</p> : null}</div>;
}

function StartReview({ request }) {
  const [state, action, pending] = useActionState(startDeletionRequestReviewAction, initialState);
  const key = useRef(crypto.randomUUID());
  if (request.status !== "submitted") return null;
  return <form action={action} onSubmit={(event) => { if (state.success) key.current = crypto.randomUUID(); event.currentTarget.elements.idempotencyKey.value = key.current; }}><input name="requestId" type="hidden" value={request.id} /><input name="idempotencyKey" type="hidden" ref={(element) => { if (element) element.value = key.current; }} /><Button disabled={pending} size="sm" type="submit" variant="secondary">{pending ? "Starting review" : "Start review"}</Button>{state.message ? <span className={state.success ? "ml-2 text-sm text-success" : "ml-2 text-sm text-destructive"} role="status">{state.message}</span> : null}</form>;
}

function HoldControl({ request }) {
  const [state, action, pending] = useActionState(changePrivacyHoldAction, initialState);
  const key = useRef(crypto.randomUUID());
  const active = request.holdStatus === "active";
  return <form action={action} className="flex flex-wrap items-center gap-2" onSubmit={(event) => { if (state.success) key.current = crypto.randomUUID(); event.currentTarget.elements.idempotencyKey.value = key.current; }}><input name="profileId" type="hidden" value={request.profileId} /><input name="action" type="hidden" value={active ? "release" : "place"} /><input name="idempotencyKey" type="hidden" ref={(element) => { if (element) element.value = key.current; }} /><Button disabled={pending} size="sm" type="submit" variant="outline"><LockKeyholeIcon aria-hidden="true" />{active ? "Release hold" : "Place hold"}</Button>{state.message ? <span className={state.success ? "text-sm text-success" : "text-sm text-destructive"} role="status">{state.message}</span> : null}</form>;
}

export function AdminPrivacyControls({ requests }) {
  const [profileId, setProfileId] = useState("");
  const [holdState, holdAction, holdPending] = useActionState(changePrivacyHoldAction, initialState);
  const holdKey = useRef(crypto.randomUUID());
  return <div className="space-y-5">
    <Card>
      <CardHeader><div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><ShieldCheckIcon aria-hidden="true" /></span><div><CardTitle>Place a profile hold</CardTitle><CardDescription className="mt-1">Use the profile UUID from an approved internal workflow. A hold skips deletion without changing payroll or audit history.</CardDescription></div></div></CardHeader>
      <CardContent><form action={holdAction} className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => { if (holdState.success) holdKey.current = crypto.randomUUID(); event.currentTarget.elements.idempotencyKey.value = holdKey.current; }}><Field className="flex-1"><FieldLabel htmlFor="profile-id">Profile UUID</FieldLabel><Input id="profile-id" name="profileId" onChange={(event) => setProfileId(event.target.value)} placeholder="00000000-0000-0000-0000-000000000000" value={profileId} /><FieldDescription>Only the profile-scoped hold is changed.</FieldDescription></Field><input name="action" type="hidden" value="place" /><input name="idempotencyKey" type="hidden" ref={(element) => { if (element) element.value = holdKey.current; }} /><Button disabled={holdPending} type="submit">{holdPending ? "Placing hold" : "Place hold"}</Button></form>{holdState.message ? <Alert className="mt-4" variant={holdState.success ? "success" : "destructive"}><AlertTitle>{holdState.success ? "Hold placed" : "Hold not placed"}</AlertTitle><AlertDescription>{holdState.message}</AlertDescription></Alert> : null}</CardContent>
    </Card>
    {requests.length ? <section aria-label="Privacy requests" className="grid gap-4">{requests.map((request) => <Card key={request.id}><CardHeader className="gap-3 border-b"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="text-base">Profile <code className="font-mono text-xs">{request.profileId}</code></CardTitle><CardDescription className="mt-1">Deletion request · submitted {dateTime(request.submittedAt)}</CardDescription></div><Badge variant={statusVariant(request.status)}>{statusLabel(request.status)}</Badge></div><dl className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3"><div><dt>Policy</dt><dd className="font-mono text-xs text-foreground">{request.policyVersion}</dd></div><div><dt>Reviewed</dt><dd>{dateTime(request.reviewedAt)}</dd></div><div><dt>Hold</dt><dd>{request.holdStatus === "active" ? "Active — deletion skipped" : "None"}</dd></div></dl></CardHeader><CardContent className="flex flex-col gap-3 pt-5"><StartReview request={request} /><RequestDecision request={request} /><HoldControl request={request} />{request.deletedCounts && Object.keys(request.deletedCounts).length ? <p className="text-xs text-muted-foreground">Safe execution counts recorded; deleted content is not displayed.</p> : null}</CardContent></Card>)}</section> : <Card><Empty><EmptyHeader><EmptyTitle>No privacy requests</EmptyTitle><EmptyDescription>Approved employee requests will appear here for review.</EmptyDescription></EmptyHeader></Empty></Card>}
  </div>;
}
