import { describe, expect, it } from "vitest";
import { calculatePayout, calculateRunTotals, PAYROLL_CALCULATION_VERSION } from "./calculator";

describe("payroll calculator", () => {
  it("calculates ordered fixed deductions and net pay", () => {
    expect(calculatePayout({
      grossAmountMinor: 50_000,
      deductions: [
        { name: "Loan", amountMinor: 5_000, displayOrder: 2 },
        { name: "Benefits", amountMinor: 2_500, displayOrder: 1 },
      ],
    })).toEqual({
      grossAmountMinor: 50_000,
      deductions: [
        { id: null, name: "Benefits", amountMinor: 2_500, displayOrder: 1 },
        { id: null, name: "Loan", amountMinor: 5_000, displayOrder: 2 },
      ],
      deductionsAmountMinor: 7_500,
      netAmountMinor: 42_500,
      calculationVersion: PAYROLL_CALCULATION_VERSION,
    });
  });

  it("rejects deductions above gross and duplicate names", () => {
    expect(() => calculatePayout({ grossAmountMinor: 100, deductions: [{ name: "Loan", amountMinor: 101 }] })).toThrow("deductions cannot exceed gross pay");
    expect(() => calculatePayout({
      grossAmountMinor: 100,
      deductions: [{ name: "Loan", amountMinor: 10 }, { name: "loan", amountMinor: 10 }],
    })).toThrow("deduction names must be unique");
  });

  it("rejects blank deduction names and unsafe totals, covers: AC-2 and AC-3", () => {
    expect(() => calculatePayout({ grossAmountMinor: 100, deductions: [{ name: "  ", amountMinor: 10 }] })).toThrow("deduction name is required");
    expect(() => calculatePayout({
      grossAmountMinor: Number.MAX_SAFE_INTEGER,
      deductions: [
        { name: "First", amountMinor: Number.MAX_SAFE_INTEGER },
        { name: "Second", amountMinor: 1 },
      ],
    })).toThrow("deduction total exceeds the safe integer range");
  });

  it("keeps an empty deduction set as an exact integer result, covers: AC-3 and AC-6", () => {
    expect(calculatePayout({ grossAmountMinor: 50_000 })).toMatchObject({
      grossAmountMinor: 50_000,
      deductions: [],
      deductionsAmountMinor: 0,
      netAmountMinor: 50_000,
    });
  });

  it("sums run totals without changing payout values", () => {
    expect(calculateRunTotals([
      { grossAmountMinor: 100, deductionsAmountMinor: 10, netAmountMinor: 90 },
      { grossAmountMinor: 200, deductionsAmountMinor: 50, netAmountMinor: 150 },
    ])).toEqual({ grossTotalMinor: 300, deductionsTotalMinor: 60, netTotalMinor: 240 });
  });
});
