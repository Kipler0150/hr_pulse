"use client";

import { useState } from "react";
import { submitLeaveRequest, approveLeaveRequest, declineLeaveRequest, cancelLeaveRequest } from "@/app/actions/time-off";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function Result({ result }) { return result ? <Alert aria-live="polite" variant={result.success ? "success" : "destructive"}><AlertTitle>{result.success ? "Saved" : result.issue.message}</AlertTitle><AlertDescription>{result.success ? "The current request state is now shown below." : result.issue.guidance}</AlertDescription></Alert> : null; }

export function LeaveRequestForm({ retryRequestId }) {
  const [result, setResult] = useState(null); const [pending, setPending] = useState(false);
  async function action(formData) { setPending(true); setResult(await submitLeaveRequest({ startDate: formData.get("startDate"), endDate: formData.get("endDate"), leaveType: formData.get("leaveType"), reason: formData.get("reason"), retryRequestId })); setPending(false); }
  return <Card><CardHeader><CardTitle>Request time off</CardTitle><CardDescription>Choose whole organization calendar dates. Requests begin today or later and do not calculate balances or payable days.</CardDescription></CardHeader><CardContent className="flex flex-col gap-5"><form action={action}><FieldGroup><Field><FieldLabel htmlFor="start-date">Start date</FieldLabel><Input id="start-date" name="startDate" required type="date" /></Field><Field><FieldLabel htmlFor="end-date">End date</FieldLabel><Input id="end-date" name="endDate" required type="date" /></Field><Field><FieldLabel htmlFor="leave-type">Type</FieldLabel><select className="min-h-11 rounded-lg border border-input bg-background px-3" id="leave-type" name="leaveType" defaultValue="paid"><option value="paid">Paid</option><option value="unpaid">Unpaid</option><option value="sick">Sick</option><option value="other">Other</option></select></Field><Field><FieldLabel htmlFor="reason">Reason <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><Textarea id="reason" maxLength={500} name="reason" /><FieldDescription>Plain text, up to 500 characters.</FieldDescription></Field></FieldGroup><Button disabled={pending} type="submit">{pending ? "Submitting…" : "Submit request"}</Button></form><Result result={result} /></CardContent></Card>;
}

export function ReviewActions({ requestId, expectedVersion, canApprove = true, canDecline = true }) {
  const [note, setNote] = useState(""); const [fallbackReason, setFallbackReason] = useState(""); const [result, setResult] = useState(null); const [pending, setPending] = useState(false);
  async function run(action) { setPending(true); const value = await action({ requestId, expectedVersion, decisionNote: note, fallbackReason, retryRequestId: crypto.randomUUID() }); setResult(value); setPending(false); }
  return <div className="flex flex-col gap-4"><Field><FieldLabel htmlFor={`decision-note-${requestId}`}>Decision note</FieldLabel><Textarea aria-describedby={`decision-note-help-${requestId}`} id={`decision-note-${requestId}`} maxLength={500} onChange={(event) => setNote(event.target.value)} value={note} /><FieldDescription id={`decision-note-help-${requestId}`}>Required when declining, plain text from 1 to 500 characters.</FieldDescription></Field><Field><FieldLabel htmlFor={`fallback-reason-${requestId}`}>Administrator override reason</FieldLabel><Textarea aria-describedby={`fallback-reason-help-${requestId}`} id={`fallback-reason-${requestId}`} maxLength={500} onChange={(event) => setFallbackReason(event.target.value)} value={fallbackReason} /><FieldDescription id={`fallback-reason-help-${requestId}`}>Required only when an administrator overrides an eligible direct manager.</FieldDescription></Field><div className="flex flex-wrap gap-3">{canApprove ? <Button disabled={pending} onClick={() => run(approveLeaveRequest)} type="button">Approve</Button> : null}{canDecline ? <Button disabled={pending} onClick={() => run(declineLeaveRequest)} type="button" variant="outline">Decline</Button> : null}</div><Result result={result} /></div>;
}

export function CancelRequest({ requestId, expectedVersion }) { const [result, setResult] = useState(null); const [pending, setPending] = useState(false); async function cancel() { setPending(true); setResult(await cancelLeaveRequest({ requestId, expectedVersion, retryRequestId: crypto.randomUUID() })); setPending(false); } return <div className="flex flex-col gap-3"><Button disabled={pending} onClick={cancel} type="button" variant="outline">{pending ? "Cancelling…" : "Cancel request"}</Button><Result result={result} /></div>; }
