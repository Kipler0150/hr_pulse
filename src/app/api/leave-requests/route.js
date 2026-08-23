import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { leaveRequests } from "@/db/schema";
import { validateDate, validateDateRange, validateUuid } from "@/db/validation";
import { jsonError, parseJson } from "@/lib/api";
import { assertEmployeeAccess, resolveOrganizationAccess } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";

export async function POST(request) {
  try {
    const body = await parseJson(request);
    const db = getDb();
    const organizationId = validateUuid(body.organizationId, "organizationId");
    const employeeId = validateUuid(body.employeeId, "employeeId");
    const supabase = await createClient();
    const { membership } = await resolveOrganizationAccess({ supabase, db, organizationId });
    await assertEmployeeAccess({ db, membership, employeeId, write: true });
    validateDateRange(body.startDate, body.endDate);
    if (!body.leaveType) throw new Error("leaveType is required");
    const [requestRow] = await db.insert(leaveRequests).values({
      employeeId, startDate: body.startDate, endDate: body.endDate,
      leaveType: body.leaveType, reason: body.reason ?? null,
    }).returning();
    return NextResponse.json(requestRow, { status: 201 });
  } catch (error) { return jsonError(error); }
}
