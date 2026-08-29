export const PAYROLL_ERROR_CATALOG = Object.freeze({
  PAYROLL_DISABLED: {
    message: "Payroll is not available.",
    guidance: "Ask an administrator to enable the payroll beta.",
    retryable: false,
  },
  PAYSLIPS_BUCKET_UNAVAILABLE: {
    message: "Private payslip storage is not available.",
    guidance: "Configure a private payslip bucket before running payroll.",
    retryable: true,
  },
  PAYROLL_FORBIDDEN: {
    message: "You do not have permission to manage payroll.",
    guidance: "Use an active administrator account for this organization.",
    retryable: false,
  },
  PAYROLL_PERIOD_BLOCKED: {
    message: "The next payroll period is blocked by an unfinished run.",
    guidance: "Complete or recover the earlier run before continuing.",
    retryable: true,
  },
  NO_CLOSED_PERIOD: {
    message: "No closed payroll period is available yet.",
    guidance: "Check the schedule start date or wait until the first period has ended.",
    retryable: false,
  },
  NO_ELIGIBLE_EMPLOYEES: {
    message: "No employees are eligible for this payroll period.",
    guidance: "Add an active employee with pay that covers the full period.",
    retryable: false,
  },
  EMPLOYEE_LIMIT_EXCEEDED: {
    message: "This payroll has more than 500 eligible employees.",
    guidance: "Reduce the eligible employee set before confirming payroll.",
    retryable: false,
  },
  PAY_SETTING_MISSING: {
    message: "An employee does not have pay that covers the full period.",
    guidance: "Add a compatible pay setting for the employee and preview again.",
    retryable: false,
  },
  TIMECARD_APPROVAL_MISSING: {
    message: "An employee timecard is not approved for this payroll period.",
    guidance: "Have the employee submit the period and an independent reviewer approve it before previewing payroll.",
    retryable: false,
  },
  CURRENCY_MISMATCH: {
    message: "A pay setting uses a different currency.",
    guidance: "Use the organization currency for every eligible employee.",
    retryable: false,
  },
  DEDUCTIONS_EXCEED_GROSS: {
    message: "Employee deductions exceed gross pay.",
    guidance: "Reduce the deductions and preview payroll again.",
    retryable: false,
  },
  PREVIEW_EXPIRED: {
    message: "This payroll preview has expired.",
    guidance: "Create a new preview before confirming payroll.",
    retryable: false,
  },
  PREVIEW_STALE: {
    message: "Payroll inputs changed after this preview was created.",
    guidance: "Review a fresh preview before confirming payroll.",
    retryable: false,
  },
  RUN_NOT_RETRYABLE: {
    message: "This payroll run is not ready to retry.",
    guidance: "Refresh the run to see its current state.",
    retryable: false,
  },
  PROCESSING_LEASE_ACTIVE: {
    message: "Payroll processing is still owned by an active worker.",
    guidance: "Wait for processing to finish or for the recovery window to open.",
    retryable: true,
  },
  QUEUE_DELIVERY_FAILED: {
    message: "Payroll was saved but could not be submitted for processing.",
    guidance: "Resubmit the queued run from its detail page.",
    retryable: true,
  },
  PAYSLIP_GENERATION_FAILED: {
    message: "A payslip could not be generated safely.",
    guidance: "Retry the failed payroll run.",
    retryable: true,
  },
  PAYSLIP_INTEGRITY_FAILED: {
    message: "A generated payslip did not pass its integrity check.",
    guidance: "Retry the failed payroll run.",
    retryable: true,
  },
  ORGANIZATION_INACTIVE: {
    message: "Payroll is unavailable while this organization is inactive.",
    guidance: "Reactivate the organization before retrying payroll.",
    retryable: true,
  },
  PAYROLL_PROCESSING_FAILED: {
    message: "Payroll processing did not complete.",
    guidance: "Review the attempt history and retry the failed run.",
    retryable: true,
  },
});

export class PayrollError extends Error {
  constructor(code, details = {}) {
    const entry = PAYROLL_ERROR_CATALOG[code] ?? PAYROLL_ERROR_CATALOG.PAYROLL_PROCESSING_FAILED;
    super(entry.message);
    this.name = "PayrollError";
    this.code = code in PAYROLL_ERROR_CATALOG ? code : "PAYROLL_PROCESSING_FAILED";
    this.guidance = entry.guidance;
    this.retryable = entry.retryable;
    this.employeeId = details.employeeId ?? null;
    this.field = details.field ?? null;
    this.cause = details.cause;
  }
}

export function payrollIssue(code, details = {}) {
  const error = new PayrollError(code, details);
  return {
    code: error.code,
    employeeId: error.employeeId,
    field: error.field,
    message: error.message,
    guidance: error.guidance,
    retryable: error.retryable,
  };
}

export function serializePayrollError(error) {
  if (error instanceof PayrollError) return payrollIssue(error.code, error);
  return payrollIssue("PAYROLL_PROCESSING_FAILED");
}
