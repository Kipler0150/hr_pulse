export const ATTENDANCE_ERROR_CATALOG = Object.freeze({
  ATTENDANCE_DISABLED: {
    message: "Attendance is not available.",
    guidance: "Ask an administrator to enable the attendance beta.",
    retryable: false,
  },
  ATTENDANCE_FORBIDDEN: {
    message: "You do not have permission to access attendance.",
    guidance: "Use an active account with attendance access in this organization.",
    retryable: false,
  },
  EMPLOYEE_NOT_ELIGIBLE: {
    message: "Your employee record is not ready for attendance.",
    guidance: "Ask an administrator to activate and link your employee access.",
    retryable: false,
  },
  ALREADY_CHECKED_IN: {
    message: "You are already checked in.",
    guidance: "Reload to view your current attendance state.",
    retryable: false,
  },
  NOT_CHECKED_IN: {
    message: "You are not currently checked in.",
    guidance: "Reload before trying to clock out again.",
    retryable: false,
  },
  FUTURE_REVIEW_DATE: {
    message: "Future attendance is not available.",
    guidance: "Choose the current organization date or an earlier date.",
    retryable: false,
  },
  INVALID_REVIEW_DATE: {
    message: "Attendance date is invalid.",
    guidance: "Use a valid date in YYYY-MM-DD format.",
    retryable: false,
  },
  INVALID_ATTENDANCE_CURSOR: {
    message: "This attendance page link is invalid.",
    guidance: "Return to the first page and try again.",
    retryable: false,
  },
  ATTENDANCE_REQUEST_FAILED: {
    message: "Attendance could not be updated.",
    guidance: "Reload your current state and try again.",
    retryable: true,
  },
});

export class AttendanceError extends Error {
  constructor(code, details = {}) {
    const safeCode = code in ATTENDANCE_ERROR_CATALOG ? code : "ATTENDANCE_REQUEST_FAILED";
    const entry = ATTENDANCE_ERROR_CATALOG[safeCode];
    super(entry.message);
    this.name = "AttendanceError";
    this.code = safeCode;
    this.guidance = entry.guidance;
    this.retryable = entry.retryable;
    this.organizationId = details.organizationId ?? null;
    this.employeeId = details.employeeId ?? null;
    this.intervalId = details.intervalId ?? null;
    this.cause = details.cause;
  }
}

export function attendanceIssue(code) {
  const error = new AttendanceError(code);
  return {
    code: error.code,
    message: error.message,
    guidance: error.guidance,
    retryable: error.retryable,
  };
}

export function serializeAttendanceError(error) {
  if (error instanceof AttendanceError) return attendanceIssue(error.code);
  return attendanceIssue("ATTENDANCE_REQUEST_FAILED");
}

export function attendanceErrorFromSupabase(error, details = {}) {
  const safeText = [error?.message, error?.details, error?.hint].filter(Boolean).join(" ");
  const code = Object.keys(ATTENDANCE_ERROR_CATALOG).find((candidate) => safeText.includes(candidate));
  return new AttendanceError(code ?? "ATTENDANCE_REQUEST_FAILED", { ...details, cause: error });
}
