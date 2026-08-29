"use client";

import { TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function TimecardsErrorPage({ reset }) {
  return <div className="flex min-h-80 items-center justify-center"><Alert className="max-w-xl" variant="destructive"><TriangleAlertIcon aria-hidden="true" /><AlertTitle>Timecards could not be loaded</AlertTitle><AlertDescription className="flex flex-col items-start gap-4"><p>Reload the current state and try again. If the problem continues, ask an administrator for help.</p><Button onClick={reset} size="comfortable" type="button" variant="outline">Try again</Button></AlertDescription></Alert></div>;
}
