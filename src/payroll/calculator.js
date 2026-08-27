import { validateMinorAmount } from "@/db/validation";

export const PAYROLL_CALCULATION_VERSION = "fixed-pay-v1";

export function calculatePayout({ grossAmountMinor, deductions = [] }) {
  validateMinorAmount(grossAmountMinor, "grossAmountMinor");
  const orderedDeductions = [...deductions]
    .map((deduction, index) => ({
      id: deduction.id ?? null,
      name: String(deduction.name ?? "").trim(),
      amountMinor: validateMinorAmount(deduction.amountMinor, `deductions[${index}].amountMinor`),
      displayOrder: Number.isInteger(deduction.displayOrder) ? deduction.displayOrder : index,
    }))
    .sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name));

  if (orderedDeductions.some((deduction) => !deduction.name)) {
    throw new Error("deduction name is required");
  }
  const names = new Set();
  for (const deduction of orderedDeductions) {
    const normalizedName = deduction.name.toLocaleLowerCase("en");
    if (names.has(normalizedName)) throw new Error("deduction names must be unique without regard to case");
    names.add(normalizedName);
  }

  const deductionsAmountMinor = orderedDeductions.reduce((total, deduction) => total + deduction.amountMinor, 0);
  if (!Number.isSafeInteger(deductionsAmountMinor)) throw new Error("deduction total exceeds the safe integer range");
  if (deductionsAmountMinor > grossAmountMinor) throw new Error("deductions cannot exceed gross pay");

  return {
    grossAmountMinor,
    deductions: orderedDeductions,
    deductionsAmountMinor,
    netAmountMinor: grossAmountMinor - deductionsAmountMinor,
    calculationVersion: PAYROLL_CALCULATION_VERSION,
  };
}

export function calculateRunTotals(payouts) {
  return payouts.reduce((totals, payout) => ({
    grossTotalMinor: totals.grossTotalMinor + payout.grossAmountMinor,
    deductionsTotalMinor: totals.deductionsTotalMinor + payout.deductionsAmountMinor,
    netTotalMinor: totals.netTotalMinor + payout.netAmountMinor,
  }), { grossTotalMinor: 0, deductionsTotalMinor: 0, netTotalMinor: 0 });
}
