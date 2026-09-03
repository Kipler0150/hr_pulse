export const AUDIT_ACTION_CATALOG = Object.freeze([
  "organization.created",
  "organization.updated",
  "membership.created",
  "membership.role_changed",
  "membership.deactivated",
  "employee.created",
  "employee.updated",
  "employee.deactivated",
  "attendance.checked_in",
  "attendance.clocked_out",
  "timecard.prepared",
  "timecard.submitted",
  "timecard.returned",
  "timecard.approved",
  "timecard.configuration_returned",
  "time_off.submitted",
  "time_off.cancelled",
  "time_off.approved",
  "time_off.declined",
  "payroll.preview_created",
  "payroll.confirmed",
  "payroll.queued",
  "payroll.processing",
  "payroll.completed",
  "payroll.failed",
  "payroll.retry_requested",
  "self_service.profile_updated",
  "auth.sign_in_succeeded",
  "auth.sign_in_failed",
  "auth.sign_out",
  "access.organization_selected",
  "access.authorization_denied",
  "release_control.changed",
  "privacy.consent_changed",
  "privacy.deletion_requested",
  "privacy.deletion_withdrawn",
  "privacy.request_review_started",
  "privacy.request_decided",
  "privacy.hold_placed",
  "privacy.hold_released",
  "privacy.deletion_completed",
  "privacy.deletion_failed",
]);

export const AUDIT_ACTIONS = new Set(AUDIT_ACTION_CATALOG);

// These names were written by earlier slices. They are accepted at the boundary
// and stored under the closest stable action so the new database check does not
// strand existing workflows during the additive rollout.
export const LEGACY_AUDIT_ACTION_ALIASES = Object.freeze({
  "organization.founded": "organization.created",
  "membership.assigned": "membership.created",
  "payroll_schedule.changed": "organization.updated",
  "pay_setting.created": "employee.updated",
  "payroll.recovered": "payroll.retry_requested",
  "overtime_policy.saved": "organization.updated",
  "attendance_interval.corrected": "attendance.clocked_out",
  "payroll.timecards_consumed": "payroll.confirmed",
  "payroll.preview.blocked": "payroll.preview_created",
  "timecard.resubmitted": "timecard.submitted",
});

export const AUDIT_ENTITY_TYPE_CATALOG = Object.freeze([
  "organization",
  "membership",
  "employee",
  "attendance_interval",
  "timecard",
  "leave_request",
  "payroll_run",
  "payout",
  "payslip",
  "profile",
  "access",
  "release_control",
]);

export const AUDIT_ENTITY_TYPES = new Set(AUDIT_ENTITY_TYPE_CATALOG);
export const LEGACY_AUDIT_ENTITY_TYPES = new Set([
  "pay_setting",
  "payroll_preview",
  "payroll_schedule",
  "overtime_policy",
  "attendance_correction",
]);

export const PRODUCT_EVENT_CATALOG = Object.freeze([
  "auth.sign_in_succeeded",
  "setup.organization_completed",
  "setup.employee_created",
  "attendance.checked_in",
  "attendance.clocked_out",
  "time_off.submitted",
  "time_off.approved",
  "time_off.declined",
  "timecard.submitted",
  "timecard.approved",
  "payroll.preview_created",
  "payroll.confirmed",
  "payroll.completed",
  "payroll.failed",
  "self_service.profile_updated",
  "self_service.payslip_downloaded",
]);

export const PRODUCT_EVENTS = new Set(PRODUCT_EVENT_CATALOG);
export const WORKFLOW_AREAS = new Set(["auth", "setup", "attendance", "time_off", "timecards", "payroll", "self_service"]);
export const RESULT_CATEGORIES = new Set(["success", "expected_error", "unexpected_error"]);
export const AUDIT_RESULTS = new Set(["success", "expected_error", "unexpected_error", "denied"]);

export const OPERATION_CATALOG = Object.freeze([
  "auth.sign_in",
  "auth.sign_out",
  "auth.organization_select",
  "setup.organization_create",
  "setup.employee_save",
  "attendance.check_in",
  "attendance.clock_out",
  "attendance.review",
  "attendance_interval.correct",
  "time_off.submit",
  "time_off.cancel",
  "time_off.approve",
  "time_off.decline",
  "timecard.prepare",
  "timecard.submit",
  "timecard.return",
  "timecard.approve",
  "overtime_policy.save",
  "payroll.preview",
  "payroll.confirm",
  "payroll.queue",
  "payroll.calculation",
  "payroll.recover",
  "payroll.retry",
  "self_service.profile_update",
  "self_service.payslip_download",
]);

export const OPERATIONS = new Set(OPERATION_CATALOG);

export const SAFE_CODE_CATALOG = Object.freeze([
  "OPERATION_UNAVAILABLE",
  "PAYROLL_DISABLED",
  "PAYSLIPS_BUCKET_UNAVAILABLE",
  "PAYROLL_FORBIDDEN",
  "PAYROLL_PERIOD_BLOCKED",
  "NO_CLOSED_PERIOD",
  "NO_ELIGIBLE_EMPLOYEES",
  "EMPLOYEE_LIMIT_EXCEEDED",
  "PAY_SETTING_MISSING",
  "TIMECARD_APPROVAL_MISSING",
  "CURRENCY_MISMATCH",
  "DEDUCTIONS_EXCEED_GROSS",
  "PREVIEW_EXPIRED",
  "PREVIEW_STALE",
  "RUN_NOT_RETRYABLE",
  "PROCESSING_LEASE_ACTIVE",
  "QUEUE_DELIVERY_FAILED",
  "PAYSLIP_GENERATION_FAILED",
  "PAYSLIP_INTEGRITY_FAILED",
  "PAYSLIP_UNAVAILABLE",
  "PAYROLL_PROCESSING_FAILED",
  "PAYROLL_FAILED",
  "ATTENDANCE_FORBIDDEN",
  "EMPLOYEE_NOT_ELIGIBLE",
  "ALREADY_CHECKED_IN",
  "NOT_CHECKED_IN",
  "ATTENDANCE_REQUEST_FAILED",
  "TIME_OFF_FORBIDDEN",
  "TIME_OFF_UNAVAILABLE",
  "TIME_OFF_REQUEST_FAILED",
  "OVERTIME_FORBIDDEN",
  "TIMECARD_INVALID_STATE",
  "TIMECARD_STALE",
  "OVERTIME_REQUEST_FAILED",
  "CONFIGURATION_DRIFT",
  "ADMINISTRATOR_FALLBACK",
  "ATTENDANCE_CORRECTION",
  "SELF_SERVICE_ACCESS_UNAVAILABLE",
  "SELF_SERVICE_UNAVAILABLE",
]);

export const SAFE_CODES = new Set(SAFE_CODE_CATALOG);

export function normalizeAuditAction(action) {
  if (AUDIT_ACTIONS.has(action)) return action;
  if (LEGACY_AUDIT_ACTION_ALIASES[action]) return LEGACY_AUDIT_ACTION_ALIASES[action];
  throw new Error("Audit action is not supported");
}

export function assertCatalogValue(value, catalog, label) {
  if (!catalog.has(value)) throw new Error(`${label} is not supported`);
  return value;
}
