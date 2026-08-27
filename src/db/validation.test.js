import { describe, expect, it } from "vitest";
import {
  validateCurrency,
  validateDate,
  validateDateRange,
  validateDeductionLines,
  validateMinorAmount,
  validatePayFrequency,
  validatePayoutAmounts,
  validateTimezone,
  validateTimestamp,
  validateUuid,
} from "./validation";

describe("core data validation", () => {
  it("accepts valid identifiers, dates, timestamps, currency, and minor units", () => {
    expect(validateUuid("123e4567-e89b-12d3-a456-426614174000")).toBeTruthy();
    expect(validateDate("2026-08-23")).toBe("2026-08-23");
    expect(validateTimestamp("2026-08-23T12:00:00Z")).toBeInstanceOf(Date);
    expect(validateCurrency("USD")).toBe("USD");
    expect(validateTimezone("Asia/Manila")).toBe("Asia/Manila");
    expect(validatePayFrequency("semimonthly")).toBe("semimonthly");
    expect(validateMinorAmount(1250)).toBe(1250);
  });

  it("rejects invalid formats and unsafe money values", () => {
    expect(() => validateUuid("employee-1")).toThrow();
    expect(() => validateDate("2026-02-30")).toThrow();
    expect(() => validateTimestamp("tomorrow")).toThrow();
    expect(() => validateCurrency("usd")).toThrow();
    expect(() => validateTimezone("Moon/Base")).toThrow();
    expect(() => validatePayFrequency("daily")).toThrow();
    expect(() => validateMinorAmount(12.5)).toThrow();
    expect(() => validateMinorAmount(-1)).toThrow();
  });

  it("validates named positive deductions", () => {
    expect(validateDeductionLines([{ name: "Benefits", amountMinor: "500" }])).toEqual([
      { name: "Benefits", amountMinor: 500, displayOrder: 0 },
    ]);
    expect(() => validateDeductionLines([{ name: "Loan", amountMinor: 10 }, { name: "loan", amountMinor: 20 }])).toThrow();
  });

  it("checks ranges and payout arithmetic", () => {
    expect(validateDateRange("2026-08-01", "2026-08-31")).toEqual({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
    });
    expect(() => validateDateRange("2026-08-31", "2026-08-01")).toThrow();
    expect(validatePayoutAmounts(10000, 1500, 8500)).toBeTruthy();
    expect(() => validatePayoutAmounts(10000, 1500, 9000)).toThrow();
  });

  it("accepts zero money and rejects unsafe integers", () => {
    expect(validateMinorAmount(0)).toBe(0);
    expect(() => validateMinorAmount(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });
});
