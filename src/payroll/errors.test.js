import { describe, expect, it } from "vitest";
import { PAYROLL_ERROR_CATALOG, PayrollError, payrollIssue, serializePayrollError } from "./errors";

describe("payroll error catalogue", () => {
  it("returns stable safe guidance and retryability, covers: AC-3, AC-8, and AC-10", () => {
    expect(payrollIssue("QUEUE_DELIVERY_FAILED")).toEqual({
      code: "QUEUE_DELIVERY_FAILED",
      employeeId: null,
      field: null,
      message: PAYROLL_ERROR_CATALOG.QUEUE_DELIVERY_FAILED.message,
      guidance: PAYROLL_ERROR_CATALOG.QUEUE_DELIVERY_FAILED.guidance,
      retryable: true,
    });
  });

  it("keeps safe employee and field identifiers without copying a cause, covers: AC-3 and AC-9", () => {
    const cause = new Error("provider secret");
    const issue = payrollIssue("PAY_SETTING_MISSING", { employeeId: "employee-id", field: "currency", cause });

    expect(issue).toMatchObject({ code: "PAY_SETTING_MISSING", employeeId: "employee-id", field: "currency" });
    expect(issue).not.toHaveProperty("cause");
    expect(JSON.stringify(issue)).not.toContain("provider secret");
  });

  it("maps unknown failures to a generic safe processing error, covers: AC-8 and AC-9", () => {
    expect(serializePayrollError(new Error("database password leaked"))).toEqual(payrollIssue("PAYROLL_PROCESSING_FAILED"));
    expect(new PayrollError("UNKNOWN")).toMatchObject({ code: "PAYROLL_PROCESSING_FAILED", retryable: true });
  });
});
