"use client";

import { useActionState } from "react";
import { Building2Icon } from "lucide-react";
import { createOrganizationAction } from "@/app/actions/organization-setup";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

const initialState = {};
const selectClassName = "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function OrganizationSetupForm() {
  const [state, action, pending] = useActionState(createOrganizationAction, initialState);
  return (
    <form action={action} className="flex flex-col gap-6">
      <FieldGroup>
        <Field data-invalid={Boolean(state.error)}>
          <FieldLabel htmlFor="organization-name">Organization name</FieldLabel>
          <Input autoComplete="organization" id="organization-name" name="name" required />
          <FieldDescription>HR Pulse derives a stable workspace address from this name.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="organization-timezone">Timezone</FieldLabel>
          <select className={selectClassName} defaultValue="Asia/Manila" id="organization-timezone" name="timezone" required>
            <option value="Asia/Manila">Asia, Manila</option>
            <option value="Asia/Singapore">Asia, Singapore</option>
            <option value="America/Los_Angeles">America, Los Angeles</option>
            <option value="America/New_York">America, New York</option>
            <option value="Europe/London">Europe, London</option>
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="organization-currency">Payroll currency</FieldLabel>
          <select className={selectClassName} defaultValue="PHP" id="organization-currency" name="currency" required>
            {['PHP', 'USD', 'SGD', 'AUD', 'EUR', 'GBP', 'JPY'].map((currency) => <option key={currency} value={currency}>{currency}</option>)}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="payroll-frequency">Payroll schedule</FieldLabel>
          <select className={selectClassName} defaultValue="semimonthly" id="payroll-frequency" name="frequency" required>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every two weeks</option>
            <option value="semimonthly">Twice monthly</option>
            <option value="monthly">Monthly</option>
          </select>
          <FieldDescription>Twice monthly uses days 1 to 15 and 16 to month end.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="effective-start-date">First period start</FieldLabel>
          <Input id="effective-start-date" name="effectiveStartDate" required type="date" />
          <FieldDescription>Use day 1 or 16 for twice monthly, and day 1 for monthly.</FieldDescription>
        </Field>
      </FieldGroup>
      {state.error ? <FieldError>{state.error}</FieldError> : null}
      <Button disabled={pending} size="comfortable" type="submit">
        {pending ? <Spinner data-icon="inline-start" /> : <Building2Icon data-icon="inline-start" />}
        {pending ? "Creating workspace" : "Create payroll workspace"}
      </Button>
    </form>
  );
}
