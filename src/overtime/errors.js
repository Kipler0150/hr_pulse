export const OVERTIME_ERROR_CATALOG = Object.freeze({
  OVERTIME_DISABLED: ["Overtime and timecards are not available.", "Ask an administrator to enable this beta feature."],
  OVERTIME_FORBIDDEN: ["You do not have permission to access this timecard.", "Use an active account with access to this employee in the selected organization."],
  TIMECARD_NOT_FOUND: ["This timecard could not be found.", "Return to the timecard list and choose an available period."],
  TIMECARD_INVALID_STATE: ["This timecard has already moved to another state.", "Reload the timecard before trying again."],
  TIMECARD_STALE: ["This timecard changed while you were working.", "Reload it and review the latest version."],
  TIMECARD_ACTIVE_PERIOD: ["This payroll period is still active.", "Wait until the organization period has closed."],
  TIMECARD_MISSING_POLICY: ["No overtime policy covers this payroll period.", "Ask an administrator to add a policy at a payroll boundary."],
  TIMECARD_MISSING_PAY: ["No complete pay setting covers this payroll period.", "Ask an administrator to add effective pay and overtime settings."],
  TIMECARD_OPEN_INTERVAL: ["An attendance interval is still open.", "Clock out before submitting this timecard."],
  TIMECARD_INVALID_INTERVAL: ["Attendance contains an invalid or overlapping interval.", "Ask an administrator to correct the completed attendance record."],
  TIMECARD_MISSING_REVIEWER: ["No independent reviewer is available.", "Ask an administrator to assign a manager or another administrator."],
  TIMECARD_ZERO_CONFIRMATION: ["Confirm the zero hour timecard before submitting.", "Review the empty period and select the confirmation box."],
  TIMECARD_CONFIGURATION_DRIFT: ["Configuration changed before approval.", "The timecard was returned so the employee can review a refreshed snapshot."],
  TIMECARD_NOTE_REQUIRED: ["A return or fallback reason is required.", "Enter between 1 and 500 characters."],
  TIMECARD_DUPLICATE_REQUEST: ["This request identity was reused with different values.", "Start a fresh action and try again."],
  TIMECARD_CORRECTION_BLOCKED: ["This correction would change frozen timecard evidence.", "Return the submitted card first. Approved cards cannot be changed."],
  OVERTIME_REQUEST_FAILED: ["The timecard request could not be completed.", "Reload the current state and try again."],
});

export class OvertimeError extends Error {
  constructor(code, details = {}) {
    const safeCode = code in OVERTIME_ERROR_CATALOG ? code : "OVERTIME_REQUEST_FAILED";
    const [message, guidance] = OVERTIME_ERROR_CATALOG[safeCode];
    super(message);
    this.name = "OvertimeError";
    this.code = safeCode;
    this.guidance = guidance;
    this.retryable = ["TIMECARD_STALE", "OVERTIME_REQUEST_FAILED"].includes(safeCode);
    this.organizationId = details.organizationId ?? null;
    this.employeeId = details.employeeId ?? null;
    this.timecardId = details.timecardId ?? null;
    this.cause = details.cause;
  }
}

export function overtimeIssue(error) {
  const safe = error instanceof OvertimeError ? error : new OvertimeError(error?.message);
  return { code: safe.code, message: safe.message, guidance: safe.guidance, retryable: safe.retryable };
}
