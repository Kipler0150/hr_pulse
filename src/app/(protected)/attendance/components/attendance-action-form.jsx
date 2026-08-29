"use client";

import { useState, useTransition } from "react";
import { CircleCheckBigIcon, ClockArrowDownIcon, ClockArrowUpIcon, TriangleAlertIcon } from "lucide-react";

import { checkInAttendance, clockOutAttendance } from "@/app/actions/attendance";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function AttendanceActionForm({ mode }) {
  const action = mode === "clock-out" ? clockOutAttendance : checkInAttendance;
  const [state, setState] = useState(null);
  const [pending, startTransition] = useTransition();
  const Icon = mode === "clock-out" ? ClockArrowDownIcon : ClockArrowUpIcon;
  const formAction = () => {
    startTransition(async () => setState(await action()));
  };

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction}>
        <Button className="w-full sm:w-auto" disabled={pending} size="comfortable" type="submit">
          {pending ? <Spinner data-icon="inline-start" /> : <Icon aria-hidden="true" data-icon="inline-start" />}
          {pending ? "Saving attendance" : mode === "clock-out" ? "Clock out" : "Check in"}
        </Button>
      </form>
      {state?.success ? (
        <Alert variant="success">
          <CircleCheckBigIcon aria-hidden="true" />
          <AlertTitle>Attendance updated</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {state?.issue ? (
        <Alert variant={state.issue.retryable ? "destructive" : "warning"}>
          <TriangleAlertIcon aria-hidden="true" />
          <AlertTitle>{state.issue.message}</AlertTitle>
          <AlertDescription>{state.issue.guidance}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
