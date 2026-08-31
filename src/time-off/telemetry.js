import * as Sentry from "@sentry/nextjs";

import { TimeOffError } from "./config";

export function recordTimeOffMetric({ operation, organizationId, requestId = null, code = "success", retryOutcome = "not_applicable", durationMs = 0 }) {
  const attributes = { operation, organizationId: organizationId ?? "unknown", requestId: requestId ?? "none", code, retryOutcome };
  const duration = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
  Sentry.metrics.count(`${operation}.count`, 1, { attributes });
  Sentry.metrics.distribution(`${operation}.duration_ms`, duration, { unit: "millisecond", attributes });
}

export function reportTimeOffFailure(error, context) {
  const safe = error instanceof TimeOffError ? error : new TimeOffError("TIME_OFF_REQUEST_FAILED");
  recordTimeOffMetric({ ...context, code: safe.code, retryOutcome: context.retryOutcome ?? "not_applicable" });
  if (safe.code !== "TIME_OFF_REQUEST_FAILED" || safe.reported) return;
  safe.reported = true;
  Sentry.captureException(new Error("TIME_OFF_REQUEST_FAILED"), {
    tags: {
      operation: context.operation,
      code: safe.code,
      organizationId: context.organizationId ?? "unknown",
      requestId: context.requestId ?? "none",
    },
  });
}
