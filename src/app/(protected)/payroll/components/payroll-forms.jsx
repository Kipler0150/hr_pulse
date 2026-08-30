"use client";

import { useActionState, useState, useTransition } from "react";
import { ArrowRightIcon, CirclePlusIcon, EyeIcon, SaveIcon, UserRoundPlusIcon } from "lucide-react";
import {
  assignMembershipAction,
  goToRunAction,
  previewPayrollAction,
  saveEmployeeAction,
  savePaySettingAction,
  updateScheduleAction,
} from "@/app/actions/payroll";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ResponsiveRecord } from "@/components/ui/responsive-record";
import { Spinner } from "@/components/ui/spinner";
import { formatPayrollMoney, formatPayrollPeriod } from "@/payroll/format";

const emptyState = {};
const selectClassName = "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function ActionMessage({ state }) {
  if (state.error) return <Alert variant="destructive"><AlertTitle>{state.error.message}</AlertTitle><AlertDescription>{state.error.guidance}</AlertDescription></Alert>;
  if (state.success) return <Alert variant="success"><AlertTitle>Changes saved</AlertTitle><AlertDescription>Your payroll setup now uses the latest information.</AlertDescription></Alert>;
  return null;
}

export function MembershipForm() {
  const [state, action, pending] = useActionState(assignMembershipAction, emptyState);
  return (
    <form action={action} className="flex flex-col gap-5">
      <FieldGroup>
        <Field><FieldLabel htmlFor="membership-email">Provisioned profile email</FieldLabel><Input id="membership-email" name="email" required type="email" /><FieldDescription>The email must exactly match an existing HR Pulse profile.</FieldDescription></Field>
        <Field><FieldLabel htmlFor="membership-role">Role</FieldLabel><select className={selectClassName} defaultValue="employee" id="membership-role" name="role"><option value="administrator">Administrator</option><option value="manager">Manager</option><option value="employee">Employee</option></select></Field>
        <Field><FieldLabel htmlFor="membership-status">Access state</FieldLabel><select className={selectClassName} defaultValue="active" id="membership-status" name="status"><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
      </FieldGroup>
      <ActionMessage state={state} />
      <Button disabled={pending} type="submit">{pending ? <Spinner data-icon="inline-start" /> : <UserRoundPlusIcon data-icon="inline-start" />}{pending ? "Saving access" : "Save role access"}</Button>
    </form>
  );
}

export function ScheduleForm({ schedule }) {
  const [state, action, pending] = useActionState(updateScheduleAction, emptyState);
  return (
    <form action={action} className="flex flex-col gap-5">
      <FieldGroup>
        <Field><FieldLabel htmlFor="schedule-frequency">Frequency</FieldLabel><select className={selectClassName} defaultValue={schedule.frequency} id="schedule-frequency" name="frequency"><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="semimonthly">Twice monthly</option><option value="monthly">Monthly</option></select></Field>
        <Field><FieldLabel htmlFor="schedule-effective">First period start</FieldLabel><Input defaultValue={schedule.effectiveStartDate} id="schedule-effective" name="effectiveStartDate" type="date" /><FieldDescription>After a completed run, HR Pulse derives this date from the next period.</FieldDescription></Field>
      </FieldGroup>
      <ActionMessage state={state} />
      <Button disabled={pending} type="submit">{pending ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}{pending ? "Saving schedule" : "Save schedule"}</Button>
    </form>
  );
}

export function EmployeeForm({ employee = null }) {
  const [state, action, pending] = useActionState(saveEmployeeAction, emptyState);
  return (
    <form action={action} className="flex flex-col gap-5">
      {employee ? <input name="employeeId" type="hidden" value={employee.id} /> : null}
      <FieldGroup>
        <Field><FieldLabel htmlFor="employee-number">Employee number</FieldLabel><Input defaultValue={employee?.employeeNumber} id="employee-number" name="employeeNumber" required /></Field>
        <Field><FieldLabel htmlFor="legal-name">Legal name</FieldLabel><Input autoComplete="name" defaultValue={employee?.legalName} id="legal-name" name="legalName" required /></Field>
        <Field><FieldLabel htmlFor="preferred-name">Preferred name</FieldLabel><Input defaultValue={employee?.preferredName ?? ""} id="preferred-name" name="preferredName" /></Field>
        <Field><FieldLabel htmlFor="employee-email">Work email</FieldLabel><Input autoComplete="email" defaultValue={employee?.email} id="employee-email" name="email" required type="email" /></Field>
        <Field><FieldLabel htmlFor="hire-date">Hire date</FieldLabel><Input defaultValue={employee?.hireDate} id="hire-date" name="hireDate" required type="date" /></Field>
        <Field><FieldLabel htmlFor="department">Department</FieldLabel><Input defaultValue={employee?.department ?? ""} id="department" name="department" /></Field>
        <Field><FieldLabel htmlFor="job-title">Job title</FieldLabel><Input defaultValue={employee?.title ?? ""} id="job-title" name="title" /></Field>
        <Field><FieldLabel htmlFor="profile-email">Linked profile email</FieldLabel><Input id="profile-email" name="profileEmail" type="email" /><FieldDescription>Leave blank to keep this employee without self service access.</FieldDescription></Field>
      </FieldGroup>
      <ActionMessage state={state} />
      <Button disabled={pending} type="submit">{pending ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}{pending ? "Saving employee" : "Save employee"}</Button>
    </form>
  );
}

export function PaySettingForm({ employeeId, currency, frequency, requestId, expectedVersion, overtimeEnabled = false }) {
  const [state, action, pending] = useActionState(savePaySettingAction, emptyState);
  const [overtimeEligible, setOvertimeEligible] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-5">
      <input name="employeeId" type="hidden" value={employeeId} />
      <input name="payFrequency" type="hidden" value={frequency} />
      <input name="requestId" type="hidden" value={requestId} />
      <input name="expectedVersion" type="hidden" value={expectedVersion} />
      <FieldGroup>
        <Field><FieldLabel htmlFor="effective-from">Effective from</FieldLabel><Input id="effective-from" name="effectiveFrom" required type="date" /></Field>
        <Field><FieldLabel htmlFor="effective-to">Effective to</FieldLabel><Input id="effective-to" name="effectiveTo" type="date" /><FieldDescription>Leave blank when this setting has no planned end.</FieldDescription></Field>
        <Field><FieldLabel htmlFor="gross-amount">Gross pay per {frequency} period</FieldLabel><Input id="gross-amount" inputMode="decimal" name="grossAmount" placeholder="0.00" required /><FieldDescription>Enter a positive amount in {currency}.</FieldDescription></Field>
        {overtimeEnabled ? <Field orientation="horizontal">
          <Checkbox checked={overtimeEligible} id="overtime-eligible" name="overtimeEligible" onCheckedChange={setOvertimeEligible} />
          <div className="flex flex-col gap-1"><FieldLabel htmlFor="overtime-eligible">Eligible for overtime</FieldLabel><FieldDescription>Payroll will use the approved timecard snapshot for this effective pay setting.</FieldDescription></div>
        </Field> : null}
        {overtimeEnabled && overtimeEligible ? (
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="standard-period-minutes">Standard period minutes</FieldLabel><Input id="standard-period-minutes" inputMode="numeric" min="1" name="standardPeriodMinutes" required type="number" /><FieldDescription>Regular minutes represented by the period gross amount.</FieldDescription></Field>
            <Field><FieldLabel htmlFor="overtime-multiplier">Overtime multiplier basis points</FieldLabel><Input defaultValue="15000" id="overtime-multiplier" inputMode="numeric" max="50000" min="10000" name="overtimeMultiplierBasisPoints" required type="number" /><FieldDescription>15000 means 1.5 times the derived hourly base.</FieldDescription></Field>
          </FieldGroup>
        ) : null}
        <FieldSet>
          <FieldLegend>Recurring fixed deductions</FieldLegend>
          {[0, 1, 2].map((index) => (
            <FieldGroup className="grid gap-3 sm:grid-cols-2" key={index}>
              <Field><FieldLabel htmlFor={`deduction-name-${index}`}>Deduction {index + 1} name</FieldLabel><Input id={`deduction-name-${index}`} name="deductionName" /></Field>
              <Field><FieldLabel htmlFor={`deduction-amount-${index}`}>Amount</FieldLabel><Input id={`deduction-amount-${index}`} inputMode="decimal" name="deductionAmount" /></Field>
            </FieldGroup>
          ))}
        </FieldSet>
      </FieldGroup>
      <ActionMessage state={state} />
      <Button disabled={pending} type="submit">{pending ? <Spinner data-icon="inline-start" /> : <CirclePlusIcon data-icon="inline-start" />}{pending ? "Adding pay" : "Add effective pay setting"}</Button>
    </form>
  );
}

export function PayrollPreview() {
  const [previewState, setPreviewState] = useState(null);
  const [loading, startPreview] = useTransition();
  const [confirmState, confirmAction, confirming] = useActionState(goToRunAction, emptyState);
  const preview = previewState?.preview;

  return (
    <div className="flex flex-col gap-6">
      <div><Button disabled={loading || confirming} onClick={() => startPreview(async () => setPreviewState(await previewPayrollAction()))} size="comfortable" type="button">{loading ? <Spinner data-icon="inline-start" /> : <EyeIcon data-icon="inline-start" />}{loading ? "Calculating preview" : "Preview next payroll"}</Button></div>
      {previewState?.error ? <Alert variant="destructive"><AlertTitle>{previewState.error.message}</AlertTitle><AlertDescription>{previewState.error.guidance}</AlertDescription></Alert> : null}
      {preview?.issues?.length ? <div className="flex flex-col gap-3" role="alert">{preview.issues.map((issue) => <Alert key={`${issue.code}-${issue.employeeId ?? "run"}`} variant="destructive"><AlertTitle>{issue.message}</AlertTitle><AlertDescription>{issue.guidance}</AlertDescription></Alert>)}</div> : null}
      {preview?.rows?.length ? (
        <Card>
          <CardHeader><CardTitle>{formatPayrollPeriod(preview.period.periodStart, preview.period.periodEnd)}</CardTitle><CardDescription>Review every amount. Confirmation freezes these inputs for all retries.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {preview.rows.map((row) => <ResponsiveRecord key={row.employeeId} title={`${row.employeeNumber} · ${row.legalName}`} priorityValues={[{ label: "Gross", value: formatPayrollMoney(row.grossAmountMinor, preview.currency, preview.currencyExponent) }, { label: "Net", value: formatPayrollMoney(row.netAmountMinor, preview.currency, preview.currencyExponent) }]} secondaryValues={[{ label: "Base gross", value: formatPayrollMoney(row.baseGrossAmountMinor, preview.currency, preview.currencyExponent) }, { label: "Overtime", value: `${row.payableOvertimeMinutes} min · ${formatPayrollMoney(row.overtimeAmountMinor, preview.currency, preview.currencyExponent)}${row.overtimeMultiplierBasisPoints ? ` · ${(row.overtimeMultiplierBasisPoints / 10000).toFixed(2)}×` : ""}` }, { label: "Deductions", value: formatPayrollMoney(row.deductionsAmountMinor, preview.currency, preview.currencyExponent) }, { label: "Deduction lines", value: row.deductions.map((line) => line.name).join(", ") || "None" }]} />)}
          </CardContent>
        </Card>
      ) : null}
      {preview?.token && preview.issues.length === 0 ? (
        <form action={confirmAction} className="flex flex-col items-start gap-3">
          <input name="previewToken" type="hidden" value={preview.token} />
          {confirmState.error ? <Alert variant="destructive"><AlertTitle>{confirmState.error.message}</AlertTitle><AlertDescription>{confirmState.error.guidance}</AlertDescription></Alert> : null}
          <Button disabled={confirming} size="comfortable" type="submit">{confirming ? <Spinner data-icon="inline-start" /> : <ArrowRightIcon data-icon="inline-start" />}{confirming ? "Confirming payroll" : "Confirm and queue payroll"}</Button>
          <p className="text-sm text-muted-foreground">This preview expires at {new Date(preview.expiresAt).toLocaleTimeString()}.</p>
        </form>
      ) : null}
    </div>
  );
}
