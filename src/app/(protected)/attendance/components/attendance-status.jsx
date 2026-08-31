import { CalendarCheck2Icon, TriangleAlertIcon } from "lucide-react";

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

export function ApprovedLeaveMarker({ marker, includeEmployee = false }) {
  return (
    <Alert variant={marker.workedDuringLeave ? "warning" : "information"}>
      {marker.workedDuringLeave ? <TriangleAlertIcon aria-hidden="true" /> : <CalendarCheck2Icon aria-hidden="true" />}
      <AlertTitle>{includeEmployee && marker.employeeName ? `${marker.employeeName}: ` : ""}{marker.workedDuringLeave ? "Worked during approved leave" : "Approved leave"}</AlertTitle>
      <AlertDescription>{marker.leaveType} leave, {marker.startDate} through {marker.endDate}. {marker.workedDuringLeave ? "Attendance remains visible for this date." : "No attendance conflict is recorded."}</AlertDescription>
    </Alert>
  );
}
