import { NextResponse } from "next/server";
import { PayrollError, serializePayrollError } from "@/payroll/errors";

export function jsonError(error) {
  if (error instanceof PayrollError) {
    const status = error.code === "PAYROLL_FORBIDDEN" ? 403 : error.code === "RUN_NOT_RETRYABLE" ? 409 : error.code === "PAYSLIP_UNAVAILABLE" ? 503 : 422;
    return NextResponse.json({ error: serializePayrollError(error) }, { status });
  }
  const message = error instanceof Error ? error.message : "Request failed";
  const status = message === "Authentication required" ? 401 : message === "Forbidden" || message.includes("access denied") ? 403 : message.includes("not found") ? 404 : 422;
  return NextResponse.json({ error: message }, { status });
}

export function parseJson(request) {
  return request.json().catch(() => {
    throw new Error("Request body must be valid JSON");
  });
}
