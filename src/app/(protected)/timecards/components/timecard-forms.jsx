"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, RefreshCwIcon, RotateCcwIcon, SaveIcon, SendIcon, WrenchIcon } from "lucide-react";

import { approveTimecardAction, correctAttendanceIntervalAction, prepareTimecardAction, returnTimecardAction, saveOvertimePolicyAction, submitTimecardAction } from "@/app/actions/timecards";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

const initialState = {};

function Result({ state, success = "Changes saved" }) {
  if (state?.error) return <Alert role="alert" variant="destructive"><AlertTitle>{state.error.message}</AlertTitle><AlertDescription>{state.error.guidance}</AlertDescription></Alert>;
  if (state?.success) return <Alert role="status" variant="success"><AlertTitle>{success}</AlertTitle><AlertDescription>The committed database state is ready to review.</AlertDescription></Alert>;
  return null;
}

function HiddenCardFields({ card, requestId }) {
  return <><input name="timecardId" type="hidden" value={card.id} /><input name="expectedVersion" type="hidden" value={card.version} /><input name="requestId" type="hidden" value={requestId} /></>;
}

export function PrepareTimecardForm({ employeeId, period, requestId }) {
  const [state, action, pending] = useActionState(prepareTimecardAction, initialState);
  const router = useRouter();
  useEffect(() => { if (state.timecardId) router.push(`/timecards/${state.timecardId}`); }, [router, state.timecardId]);
  return <form action={action} className="flex flex-col items-start gap-3"><input name="employeeId" type="hidden" value={employeeId} /><input name="periodStart" type="hidden" value={period.periodStart} /><input name="periodEnd" type="hidden" value={period.periodEnd} /><input name="requestId" type="hidden" value={requestId} /><Result state={state} success="Timecard ready" /><Button disabled={pending} size="comfortable" type="submit">{pending ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}{pending ? "Preparing timecard" : "Review latest closed period"}</Button></form>;
}

export function SubmitTimecardForm({ canSubmit, card, requestId }) {
  const [state, action, pending] = useActionState(submitTimecardAction, initialState);
  if (!canSubmit) return <Result state={state} success="Timecard submitted" />;
  return <Card><CardHeader><CardTitle>Submit for approval</CardTitle><CardDescription>Submission freezes this evidence until a reviewer approves or returns it.</CardDescription></CardHeader><CardContent><form action={action} className="flex flex-col gap-4"><HiddenCardFields card={card} requestId={requestId} />{card.workedSeconds === 0 ? <Field orientation="horizontal"><Checkbox id="zero-hours-confirmed" name="zeroHoursConfirmed" /><div className="flex flex-col gap-1"><FieldLabel htmlFor="zero-hours-confirmed">I confirm this period has zero hours</FieldLabel><FieldDescription>This explicit confirmation is required before submission.</FieldDescription></div></Field> : null}<Result state={state} success="Timecard submitted" /><Button disabled={pending} size="comfortable" type="submit">{pending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}{pending ? "Submitting" : card.status === "returned" ? "Resubmit timecard" : "Submit timecard"}</Button></form></CardContent></Card>;
}

export function ReviewTimecardForms({ canAct, card, isAdministrator, requestIds }) {
  const [approveState, approveAction, approving] = useActionState(approveTimecardAction, initialState);
  const [returnState, returnAction, returning] = useActionState(returnTimecardAction, initialState);
  if (!canAct) return <><Result state={approveState} success={approveState.configurationDrift ? "Timecard returned for fresh review" : "Timecard approved"} /><Result state={returnState} success="Timecard returned" /></>;
  return <Card><CardHeader><CardTitle>Independent review</CardTitle><CardDescription>Approve this immutable snapshot or return it with clear guidance.</CardDescription></CardHeader><CardContent><div className="grid gap-5 lg:grid-cols-2"><form action={approveAction} className="flex flex-col gap-4"><HiddenCardFields card={card} requestId={requestIds.approve} />{isAdministrator ? <Field><FieldLabel htmlFor="approve-fallback-reason">Administrator fallback reason</FieldLabel><Textarea id="approve-fallback-reason" maxLength={500} name="fallbackReason" /><FieldDescription>Required when an eligible direct manager is available.</FieldDescription></Field> : null}<Result state={approveState} success={approveState.configurationDrift ? "Timecard returned for fresh review" : "Timecard approved"} /><Button disabled={approving} size="comfortable" type="submit">{approving ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}{approving ? "Approving" : "Approve timecard"}</Button></form><form action={returnAction} className="flex flex-col gap-4"><HiddenCardFields card={card} requestId={requestIds.return} /><Field><FieldLabel htmlFor="return-note">Return note</FieldLabel><Textarea id="return-note" maxLength={500} minLength={1} name="note" required /><FieldDescription>Explain what the employee should review or ask an administrator to correct.</FieldDescription></Field>{isAdministrator ? <Field><FieldLabel htmlFor="return-fallback-reason">Administrator fallback reason</FieldLabel><Textarea id="return-fallback-reason" maxLength={500} name="fallbackReason" /><FieldDescription>Required when an eligible direct manager is available.</FieldDescription></Field> : null}<Result state={returnState} success="Timecard returned" /><Button disabled={returning} size="comfortable" type="submit" variant="outline">{returning ? <Spinner data-icon="inline-start" /> : <RotateCcwIcon data-icon="inline-start" />}{returning ? "Returning" : "Return for changes"}</Button></form></div></CardContent></Card>;
}

export function OvertimePolicyForm({ latestVersion, requestId, suggestedDate }) {
  const [state, action, pending] = useActionState(saveOvertimePolicyAction, initialState);
  return <form action={action} className="flex flex-col gap-5"><input name="expectedVersion" type="hidden" value={latestVersion} /><input name="requestId" type="hidden" value={requestId} /><FieldGroup><Field><FieldLabel htmlFor="policy-effective">Effective payroll period start</FieldLabel><Input defaultValue={suggestedDate} id="policy-effective" name="effectiveFrom" required type="date" /><FieldDescription>The date must align with the organization payroll schedule.</FieldDescription></Field><Field><FieldLabel htmlFor="daily-threshold">Daily threshold minutes</FieldLabel><Input defaultValue="480" id="daily-threshold" max="1440" min="1" name="dailyThresholdMinutes" required type="number" /></Field><Field orientation="horizontal"><Checkbox defaultChecked id="policy-enabled" name="enabled" /><div className="flex flex-col gap-1"><FieldLabel htmlFor="policy-enabled">Overtime calculation enabled</FieldLabel><FieldDescription>A disabled policy still creates reviewable timecards with zero overtime.</FieldDescription></div></Field></FieldGroup><Result state={state} success="Overtime policy saved" /><Button disabled={pending} type="submit">{pending ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}{pending ? "Saving policy" : "Save new policy version"}</Button></form>;
}

export function AttendanceCorrectionForm({ requestId }) {
  const [state, action, pending] = useActionState(correctAttendanceIntervalAction, initialState);
  return <form action={action} className="flex flex-col gap-5"><input name="requestId" type="hidden" value={requestId} /><FieldGroup><Field><FieldLabel htmlFor="correction-interval">Completed interval ID</FieldLabel><Input id="correction-interval" name="intervalId" required /></Field><Field><FieldLabel htmlFor="latest-correction">Latest correction ID</FieldLabel><Input id="latest-correction" name="expectedCorrectionId" /><FieldDescription>Leave blank for the first correction. For later changes, copy the latest correction ID to prevent stale edits.</FieldDescription></Field><Field><FieldLabel htmlFor="corrected-clock-in">Corrected clock in UTC</FieldLabel><Input id="corrected-clock-in" name="correctedClockIn" placeholder="2026-08-28T00:00:00Z" required /><FieldDescription>Use an ISO 8601 UTC instant ending in Z.</FieldDescription></Field><Field><FieldLabel htmlFor="corrected-clock-out">Corrected clock out UTC</FieldLabel><Input id="corrected-clock-out" name="correctedClockOut" placeholder="2026-08-28T08:00:00Z" required /></Field><Field><FieldLabel htmlFor="correction-reason">Correction reason</FieldLabel><Textarea id="correction-reason" maxLength={500} minLength={1} name="reason" required /></Field></FieldGroup><Result state={state} success="Attendance correction appended" /><Button disabled={pending} type="submit">{pending ? <Spinner data-icon="inline-start" /> : <WrenchIcon data-icon="inline-start" />}{pending ? "Saving correction" : "Append correction"}</Button></form>;
}
