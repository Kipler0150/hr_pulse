"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { updateSelfServiceProfileAction } from "@/app/actions/self-service";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const initialState = { success: false };

export function SelfServiceProfileForm({ employee }) {
  const router = useRouter();
  const [preferredName, setPreferredName] = useState(employee.preferredName ?? "");
  const [phone, setPhone] = useState(employee.phone ?? "");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(updateSelfServiceProfileAction, initialState);
  useEffect(() => {
    if (!state.success) return undefined;
    const refreshTimer = window.setTimeout(() => router.refresh(), 1500);
    return () => window.clearTimeout(refreshTimer);
  }, [router, state.success]);
  const version = state.success && state.result?.version ? state.result.version : employee.version;
  const terminalResult = state.success || ["SELF_SERVICE_INVALID_INPUT", "SELF_SERVICE_STALE", "SELF_SERVICE_RETRY_CONFLICT"].includes(state.code);
  const activeRequestId = terminalResult ? crypto.randomUUID() : requestId;
  return <form action={action} className="flex flex-col gap-6">
    <input name="expectedVersion" type="hidden" value={version} />
    <input name="requestId" type="hidden" value={activeRequestId} />
    <FieldGroup>
      <Field data-invalid={state.code === "SELF_SERVICE_INVALID_INPUT"}>
        <FieldLabel htmlFor="preferredName">Preferred name</FieldLabel>
        <Input aria-invalid={state.code === "SELF_SERVICE_INVALID_INPUT"} value={preferredName} onChange={(event) => setPreferredName(event.target.value)} id="preferredName" maxLength={200} name="preferredName" />
        <FieldDescription>Leave blank to use your legal name throughout HR Pulse.</FieldDescription>
      </Field>
      <Field data-invalid={state.code === "SELF_SERVICE_INVALID_INPUT"}>
        <FieldLabel htmlFor="phone">Phone</FieldLabel>
        <Input aria-describedby="phone-help" aria-invalid={state.code === "SELF_SERVICE_INVALID_INPUT"} value={phone} onChange={(event) => setPhone(event.target.value)} id="phone" inputMode="tel" name="phone" placeholder="+639171234567" />
        <FieldDescription id="phone-help">Use international format: a plus sign followed by 7 to 15 digits.</FieldDescription>
        {state.code === "SELF_SERVICE_INVALID_INPUT" ? <FieldError>{state.message}</FieldError> : null}
      </Field>
    </FieldGroup>
    {state.message && state.code !== "SELF_SERVICE_INVALID_INPUT" ? <Alert variant={state.success ? "success" : "destructive"}><AlertTitle>{state.success ? "Profile updated" : "Profile not updated"}</AlertTitle><AlertDescription>{state.success ? "Your contact details are current." : `${state.message} ${state.guidance}`}</AlertDescription></Alert> : null}
    <Button disabled={pending} type="submit">{pending ? "Saving profile" : "Save profile"}</Button>
  </form>;
}
