"use client";

import { AlertTriangleIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function PayrollError({ reset }) {
  return <div className="flex flex-col gap-4"><Alert variant="destructive"><AlertTriangleIcon aria-hidden="true" /><AlertTitle>Payroll could not load</AlertTitle><AlertDescription>No payroll changes were made. Try loading the protected organization state again.</AlertDescription></Alert><div><Button onClick={reset} type="button">Try again</Button></div></div>;
}
