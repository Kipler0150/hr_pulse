import { describe, expect, it } from "vitest";
import { formatLeaveRequest, normalizeText, validateRequestInput } from "./domain";

describe("time off domain", () => {
  it("normalizes line endings and optional empty reasons", () => {
    expect(normalizeText("  first\r\nsecond  ")).toBe("first\nsecond");
    expect(validateRequestInput({ startDate: "2026-09-01", endDate: "2026-09-01", leaveType: "paid", reason: "  " }).reason).toBeNull();
  });

  it("accepts inclusive ranges through 366 days", () => {
    expect(validateRequestInput({ startDate: "2026-09-01", endDate: "2027-09-01", leaveType: "other" }).calendarDays).toBe(366);
  });

  it("rejects invalid type, range, control characters, and long reason", () => {
    expect(() => validateRequestInput({ startDate: "2026-09-02", endDate: "2026-09-01", leaveType: "paid" })).toThrow();
    expect(() => validateRequestInput({ startDate: "2026-09-01", endDate: "2026-09-01", leaveType: "holiday" })).toThrow();
    expect(() => validateRequestInput({ startDate: "2026-09-01", endDate: "2026-09-01", leaveType: "paid", reason: "x\u0000" })).toThrow();
    expect(() => validateRequestInput({ startDate: "2026-09-01", endDate: "2026-09-01", leaveType: "paid", reason: "x".repeat(501) })).toThrow();
  });

  it("maps database and domain field names consistently", () => {
    expect(formatLeaveRequest({ id: "request", leave_type: "sick", start_date: "2026-09-01", end_date: "2026-09-02", status: "submitted", version: 1 })).toMatchObject({ id: "request", leaveType: "sick", startDate: "2026-09-01", endDate: "2026-09-02" });
  });
});
