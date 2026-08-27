import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { payrollRuns, payouts, payslips } from "@/db/schema";
import { validateUuid } from "@/db/validation";
import { jsonError } from "@/lib/api";
import { createPayslipDownloadUrl, verifyPayslipObject } from "@/lib/storage";
import { requirePayrollAdministrator } from "@/payroll/access";
import { PayrollError } from "@/payroll/errors";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const payslipId = validateUuid(id, "payslipId");
    const context = await requirePayrollAdministrator();
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
      ));
    if (!row) throw new Error("Payslip not found");
    if (!row.payslip.storagePath || !row.payslip.sha256 || !row.payslip.immutable) throw new Error("Payslip is not generated");
    let url;
    try {
      await verifyPayslipObject(row.payslip.storagePath, row.payslip.sha256);
      url = await createPayslipDownloadUrl(row.payslip.storagePath);
    } catch (error) {
      if (error instanceof PayrollError) throw error;
      throw new PayrollError("PAYSLIP_INTEGRITY_FAILED", { cause: error });
    }
    return NextResponse.json({ url, expiresIn: 60 });
  } catch (error) { return jsonError(error); }
}
