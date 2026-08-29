import { TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusBadge, getStatusPresentation } from "@/components/ui/status-badge";

export function AttendanceStatus({ interval }) {
  const status = interval?.status ?? "completed";
  const presentation = interval
    ? getStatusPresentation(status)
    : { ...getStatusPresentation("completed"), label: "Checked out" };
  return <StatusBadge {...presentation} />;
}

export function LongIntervalWarning() {
  return (
    <Alert variant="warning">
      <TriangleAlertIcon aria-hidden="true" />
      <AlertTitle>Long interval</AlertTitle>
      <AlertDescription>Long interval: this session was longer than 24 hours.</AlertDescription>
    </Alert>
  );
}
