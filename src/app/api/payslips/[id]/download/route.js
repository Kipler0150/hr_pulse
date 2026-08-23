import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { employees, payrollRuns, payouts, payslips } from "@/db/schema";
import { validateUuid } from "@/db/validation";
import { jsonError } from "@/lib/api";
import { assertEmployeeAccess, resolveOrganizationAccess } from "@/lib/authorization";
import { createPayslipDownloadUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const payslipId = validateUuid(id, "payslipId");
    const db = getDb();
    const [row] = await db.select({
      payslip: payslips,
      payout: payouts,
      payrollRun: payrollRuns,
      employee: employees,
    }).from(payslips)
      .innerJoin(payouts, eq(payslips.payoutId, payouts.id))
      .innerJoin(payrollRuns, eq(payouts.payrollRunId, payrollRuns.id))
      .innerJoin(employees, eq(payouts.employeeId, employees.id))
      .where(and(eq(payslips.id, payslipId), eq(payslips.status, "generated")));
    if (!row) throw new Error("Payslip not found");
    const { membership } = await resolveOrganizationAccess({
      supabase: await createClient(), db, organizationId: row.payrollRun.organizationId,
    });
    await assertEmployeeAccess({ db, membership, employeeId: row.employee.id });
    if (!row.payslip.storagePath) throw new Error("Payslip is not generated");
    const url = await createPayslipDownloadUrl(row.payslip.storagePath);
    return NextResponse.json({ url, expiresIn: 300 });
  } catch (error) { return jsonError(error); }
}
