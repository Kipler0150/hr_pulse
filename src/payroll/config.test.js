import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPayrollEnabled, assertPayslipConfiguration, getPayrollReleaseState, isPayrollEnabled } from "./config";

describe("payroll release configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults payroll off in production, covers: AC-12", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYROLL_ENABLED", "");

    expect(isPayrollEnabled()).toBe(false);
    expect(() => assertPayrollEnabled()).toThrowError(expect.objectContaining({ code: "PAYROLL_DISABLED", retryable: false }));
  });

  it("allows an explicit production enablement and reports synthetic data, covers: AC-12", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYROLL_ENABLED", "true");

    expect(getPayrollReleaseState()).toEqual({ enabled: true, syntheticDataOnly: true });
  });

  it("honors an explicit development disablement, covers: AC-12", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PAYROLL_ENABLED", "false");

    expect(isPayrollEnabled()).toBe(false);
  });

  it("fails closed without a private payslip bucket name, covers: AC-7 and AC-12", () => {
    vi.stubEnv("SUPABASE_PAYSLIPS_BUCKET", "");
    expect(() => assertPayslipConfiguration()).toThrowError(expect.objectContaining({ code: "PAYSLIPS_BUCKET_UNAVAILABLE", retryable: true }));

    vi.stubEnv("SUPABASE_PAYSLIPS_BUCKET", "private-payslips");
    expect(assertPayslipConfiguration()).toBe("private-payslips");
  });
});
