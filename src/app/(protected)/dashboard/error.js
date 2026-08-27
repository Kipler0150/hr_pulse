"use client";

import { CircleAlertIcon, RotateCcwIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function DashboardError({ reset }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-xl">
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>The dashboard could not load</AlertTitle>
          <AlertDescription>Try again. If the problem continues, sign in again so HR Pulse can refresh your organization access.</AlertDescription>
        </Alert>
        <Button className="mt-4" onClick={reset} size="comfortable" type="button"><RotateCcwIcon data-icon="inline-start" />Try again</Button>
      </div>
    </main>
  );
}
