import * as Sentry from "@sentry/nextjs";
import { appendFileSync } from "node:fs";

import { SELF_SERVICE_ERROR_CATALOG, SelfServiceError } from "./errors";

export const SELF_SERVICE_OPERATIONS = Object.freeze(new Set([
  "self_service.home",
  "self_service.profile.read",
  "self_service.profile.update",
  "self_service.time.list",
  "self_service.time.detail",
  "self_service.payslips.list",
  "self_service.payslip.detail",
  "self_service.payslip.download",
]));
const SELF_SERVICE_RESULTS = new Set(["success", "expected_error", "unexpected_error"]);
const SELF_SERVICE_RETRY_OUTCOMES = new Set(["not_applicable", "new", "replayed", "conflict"]);
const SELF_SERVICE_CODES = new Set(["none", ...Object.keys(SELF_SERVICE_ERROR_CATALOG)]);

function safeOperation(operation) {
  return SELF_SERVICE_OPERATIONS.has(operation) ? operation : "self_service.home";
}

function writeLocalTelemetry(event) {
  const sink = process.env.HR_PULSE_SELF_SERVICE_TELEMETRY_SINK;
  if (process.env.HR_PULSE_SELF_SERVICE_TELEMETRY_SINK_MODE !== "test" || !sink) return;
  appendFileSync(sink, `${JSON.stringify(event)}\n`, "utf8");
}

export function recordSelfServiceMetric({ operation, organizationId, employeeId = null, code = "ok", result: requestedResult, retryOutcome: requestedRetryOutcome, durationMs = 0, count = 1 }) {
  const operationName = safeOperation(operation);
  const result = requestedResult ?? (code === "ok" || code === "none" ? "success" : "expected_error");
  const retryOutcome = requestedRetryOutcome ?? "not_applicable";
  const attributes = {
    operation: operationName,
    result: SELF_SERVICE_RESULTS.has(result) ? result : "unexpected_error",
    retryOutcome: SELF_SERVICE_RETRY_OUTCOMES.has(retryOutcome) ? retryOutcome : "not_applicable",
    organizationId: organizationId ?? "unknown",
    employeeId: employeeId ?? "none",
    code: code === "ok" || code === "none" ? "none" : (SELF_SERVICE_CODES.has(code) ? code : "SELF_SERVICE_UNAVAILABLE"),
  };
  const duration = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
  writeLocalTelemetry({ type: "metric", name: `${operationName}.count`, value: count, attributes });
  writeLocalTelemetry({ type: "metric", name: `${operationName}.duration_ms`, value: duration, unit: "millisecond", attributes });
  Sentry.metrics.count(`${operationName}.count`, count, { attributes });
  Sentry.metrics.distribution(`${operationName}.duration_ms`, duration, { unit: "millisecond", attributes });
  console.info("[self-service.metric]", { ...attributes, count, durationMs: duration });
}

export function reportSelfServiceFailure(error, context) {
  const safe = error instanceof SelfServiceError ? error : new SelfServiceError("SELF_SERVICE_UNAVAILABLE");
  const expected = error instanceof SelfServiceError && safe.code !== "SELF_SERVICE_UNAVAILABLE";
  recordSelfServiceMetric({ operation: context.operation, organizationId: context.organizationId, employeeId: context.employeeId, code: safe.code, result: expected ? "expected_error" : "unexpected_error", retryOutcome: safe.code === "SELF_SERVICE_RETRY_CONFLICT" ? "conflict" : "not_applicable", durationMs: context.durationMs });
  if (safe.code !== "SELF_SERVICE_UNAVAILABLE" || safe.reported) return;
  safe.reported = true;
  const operation = safeOperation(context.operation);
  writeLocalTelemetry({ type: "exception", message: "SELF_SERVICE_UNAVAILABLE", tags: { operation, code: safe.code } });
  Sentry.captureException(new Error("SELF_SERVICE_UNAVAILABLE"), { tags: { operation, code: safe.code } });
}
