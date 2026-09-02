import { SelfServiceError } from "./errors";

export function isSelfServiceEnabled() {
  if (process.env.HR_PULSE_SELF_SERVICE_ENABLED !== "true") return false;
  return process.env.NODE_ENV !== "production" || process.env.HR_PULSE_REAL_EMPLOYEE_DATA_ENABLED === "true";
}

export function assertSelfServiceEnabled() {
  if (!isSelfServiceEnabled()) throw new SelfServiceError("SELF_SERVICE_DISABLED");
}

export function getCursorSecret() {
  const secret = process.env.HR_PULSE_SELF_SERVICE_CURSOR_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV !== "production") return "hr-pulse-self-service-development-cursor-secret";
  throw new SelfServiceError("SELF_SERVICE_UNAVAILABLE");
}

const TEST_FAILURE_POINTS = new Set(["access", "home.timecard", "home.payslip", "download.signing"]);

export function assertSelfServiceTestFailure(point) {
  if (TEST_FAILURE_POINTS.has(point) && process.env.NODE_ENV !== "production" && process.env.HR_PULSE_SELF_SERVICE_TEST_FAILURE === point) {
    throw new SelfServiceError("SELF_SERVICE_UNAVAILABLE");
  }
}
