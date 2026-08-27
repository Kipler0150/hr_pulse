import { NextResponse } from "next/server";
import { validateUuid } from "@/db/validation";
import { jsonError } from "@/lib/api";
import { requirePayrollAdministrator } from "@/payroll/access";
import { payrollIssue } from "@/payroll/errors";
import { getPayrollRunStatus } from "@/payroll/service";

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const runId = validateUuid(id, "runId");
    const context = await requirePayrollAdministrator();
    const detail = await getPayrollRunStatus(context.organizationId, runId);
    const failure = detail.run.errorCode ? payrollIssue(detail.run.errorCode) : null;

    return NextResponse.json({
      id: detail.run.id,
      status: detail.run.status,
      queueStatus: detail.run.queueStatus,
      updatedAt: detail.run.updatedAt,
      lastProgressAt: detail.run.lastProgressAt,
      totals: {
        grossAmountMinor: detail.run.grossTotalMinor,
        deductionsAmountMinor: detail.run.deductionsTotalMinor,
        netAmountMinor: detail.run.netTotalMinor,
        currency: detail.run.currency,
        currencyExponent: detail.run.currencyExponent,
      },
      attemptCount: detail.attemptCount,
      delayed: detail.delayed,
      recoveryEligible: Boolean(detail.recoveryEligible),
      failure: failure ? {
        code: failure.code,
        message: failure.message,
        guidance: detail.run.errorGuidance ?? failure.guidance,
        retryable: failure.retryable,
      } : null,
    });
  } catch (error) {
    return jsonError(error);
  }
}
