import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { payrollRuns, payouts, payslips } from "@/db/schema";
import { validateUuid } from "@/db/validation";
import { jsonError } from "@/lib/api";
import { createPayslipDownloadUrl, verifyPayslipObject } from "@/lib/storage";
import { requirePayrollAdministrator } from "@/payroll/access";
import { PayrollError } from "@/payroll/errors";
import { isSelfServiceEnabled } from "@/self-service/config";
import { requireSelfServiceContext } from "@/self-service/access";
import { randomUUID } from "node:crypto";
import { recordProductMilestone } from "@/product-operations/integration";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const payslipId = validateUuid(id, "payslipId");
    let context;
    let employeeId = null;
    try {
      context = await requirePayrollAdministrator();
    } catch (error) {
      if (!isSelfServiceEnabled()) throw error;
      let selfService;
      try {
        selfService = await requireSelfServiceContext();
      } catch {
        throw new PayrollError("PAYROLL_FORBIDDEN");
      }
      context = { organizationId: selfService.organizationId };
      employeeId = selfService.employee.id;
    }
    const db = getDb();
    const [row] = await db.select({
      payslip: payslips,
      payout: payouts,
      payrollRun: payrollRuns,
    }).from(payslips)
      .innerJoin(payouts, eq(payslips.payoutId, payouts.id))
      .innerJoin(payrollRuns, eq(payouts.payrollRunId, payrollRuns.id))
      .where(and(
        eq(payslips.id, payslipId),
        eq(payslips.status, "generated"),
        eq(payrollRuns.organizationId, context.organizationId),
        ...(employeeId ? [eq(payouts.employeeId, employeeId)] : []),
        eq(payrollRuns.status, "completed"),
        eq(payouts.status, "finalized"),
      ));
    if (!row) throw new Error("Payslip not found");
    if (!row.payslip.storagePath || !row.payslip.sha256 || !row.payslip.immutable) throw new PayrollError("PAYSLIP_UNAVAILABLE");
    let url;
    try {
      await verifyPayslipObject(row.payslip.storagePath, row.payslip.sha256);
      url = await createPayslipDownloadUrl(row.payslip.storagePath);
    } catch (error) {
      throw new PayrollError("PAYSLIP_UNAVAILABLE", { cause: error });
    }
    await recordProductMilestone({ organizationId: context.organizationId, eventName: "self_service.payslip_downloaded", workflowArea: "self_service", resultCategory: "success", occurrenceIdentity: `${payslipId}:${randomUUID()}`, analyticsProfileId: context.profile?.id });
    return NextResponse.json({ url, expiresIn: 60 });
  } catch (error) { return jsonError(error); }
}
