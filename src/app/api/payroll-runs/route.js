import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { requirePayrollAdministrator } from "@/payroll/access";
import { listPayrollRuns } from "@/payroll/service";

export async function GET(request) {
  try {
    const context = await requirePayrollAdministrator();
    const cursor = new URL(request.url).searchParams.get("cursor");
    const { rows, nextCursor } = await listPayrollRuns(context.organizationId, cursor);
    return NextResponse.json({
      data: rows.map((run) => ({
        id: run.id,
        periodStart: run.periodStart,
        periodEnd: run.periodEnd,
        status: run.status,
        currency: run.currency,
        grossTotalMinor: run.grossTotalMinor,
        deductionsTotalMinor: run.deductionsTotalMinor,
        netTotalMinor: run.netTotalMinor,
        updatedAt: run.updatedAt,
      })),
      nextCursor,
    });
  } catch (error) { return jsonError(error); }
}
