import { PayrollError } from "./errors";

export function isPayrollEnabled() {
  if (process.env.PAYROLL_ENABLED === "true") return true;
  return process.env.NODE_ENV !== "production" && process.env.PAYROLL_ENABLED !== "false";
}

export function assertPayrollEnabled() {
  if (!isPayrollEnabled()) throw new PayrollError("PAYROLL_DISABLED");
}

export function assertPayslipConfiguration() {
  if (!process.env.SUPABASE_PAYSLIPS_BUCKET) throw new PayrollError("PAYSLIPS_BUCKET_UNAVAILABLE");
  return process.env.SUPABASE_PAYSLIPS_BUCKET;
}

export function getPayrollReleaseState() {
  return {
    enabled: isPayrollEnabled(),
    syntheticDataOnly: true,
  };
}
