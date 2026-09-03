"use client";

import { AlertTriangleIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function OperationsError({ reset }) {
  return <div className="flex flex-col gap-4"><Alert variant="destructive"><AlertTriangleIcon aria-hidden="true" /><AlertTitle>Operations could not load</AlertTitle><AlertDescription>No operational records were changed. Try the protected workspace again.</AlertDescription></Alert><div><Button onClick={reset} type="button">Try again</Button></div></div>;
}
