import * as Sentry from "@sentry/nextjs";

export function recordPayrollMetric({ operation, organizationId, entityId = null, code = "none", durationMs, count = 1 }) {
  const attributes = {
    operation,
    organizationId: organizationId ?? "unknown",
    entityId: entityId ?? "none",
    code,
  };
  const duration = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
  Sentry.metrics.count(`${operation}.count`, count, { attributes });
  Sentry.metrics.distribution(`${operation}.duration_ms`, duration, { unit: "millisecond", attributes });
  console.info("[payroll.metric]", { ...attributes, count, durationMs: duration });
}
