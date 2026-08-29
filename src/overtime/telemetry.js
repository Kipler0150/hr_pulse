import * as Sentry from "@sentry/nextjs";

import { OvertimeError } from "./errors";

export function reportOvertimeFailure(error, context) {
  const safe = error instanceof OvertimeError ? error : new OvertimeError("OVERTIME_REQUEST_FAILED");
  if (safe.code !== "OVERTIME_REQUEST_FAILED" || safe.reported) return;
  safe.reported = true;
  Sentry.captureException(new Error("OVERTIME_REQUEST_FAILED"), {
    tags: {
      operation: context.operation,
      code: safe.code,
      organizationId: context.organizationId ?? "unknown",
      employeeId: context.employeeId ?? "none",
      timecardId: context.timecardId ?? "none",
    },
  });
}
