import * as Sentry from "@sentry/nextjs";

import { AttendanceError } from "./errors";

export function reportAttendanceFailure(error, context) {
  const safe = error instanceof AttendanceError ? error : new AttendanceError("ATTENDANCE_REQUEST_FAILED");
  if (safe.code !== "ATTENDANCE_REQUEST_FAILED" || safe.reported) return;
  safe.reported = true;
  Sentry.captureException(new Error("ATTENDANCE_REQUEST_FAILED"), {
    tags: {
      action: context.action,
      code: safe.code,
      organizationId: context.organizationId ?? "unknown",
      employeeId: context.employeeId ?? "none",
      intervalId: context.intervalId ?? "none",
    },
  });
}
