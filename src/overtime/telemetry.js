import * as Sentry from "@sentry/nextjs";

import { OvertimeError } from "./errors";

export function recordOvertimeMetric({ operation, organizationId, entityId = null, code = "ok", durationMs = 0, count = 1 }) {
  const attributes = {
    operation,
    organizationId: organizationId ?? "unknown",
    entityId: entityId ?? "none",
    code,
  };
  const duration = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
  Sentry.metrics.count(`${operation}.count`, count, { attributes });
  Sentry.metrics.distribution(`${operation}.duration_ms`, duration, { unit: "millisecond", attributes });
  console.info("[overtime.metric]", { ...attributes, count, durationMs: duration });
}

export function reportOvertimeFailure(error, context) {
  const safe = error instanceof OvertimeError ? error : new OvertimeError("OVERTIME_REQUEST_FAILED");
  const operation = safe.code === "TIMECARD_INVALID_INTERVAL" && context.operation === "timecard.prepare" ? "timecard.calculation" : context.operation;
  recordOvertimeMetric({ operation, organizationId: context.organizationId, entityId: context.timecardId ?? context.employeeId, code: safe.code, durationMs: context.durationMs });
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
