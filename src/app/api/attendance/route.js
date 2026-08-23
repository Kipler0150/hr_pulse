import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { attendanceIntervals } from "@/db/schema";
import { validateTimestamp, validateUuid } from "@/db/validation";
import { jsonError, parseJson } from "@/lib/api";
import { assertEmployeeAccess, resolveOrganizationAccess, assertRole } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";

export async function POST(request) {
  try {
    const body = await parseJson(request);
    const db = getDb();
    const employeeId = validateUuid(body.employeeId, "employeeId");
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!user) throw new Error("Authentication required");
    const organizationId = validateUuid(body.organizationId, "organizationId");
    const { membership } = await resolveOrganizationAccess({ supabase, db, organizationId });
    const employee = await assertEmployeeAccess({ db, membership, employeeId, write: true });
    const eventTime = body.eventTime ? validateTimestamp(body.eventTime, "eventTime") : new Date();
    const action = body.action;
    if (action === "check_in") {
      const [interval] = await db.insert(attendanceIntervals).values({ employeeId, clockIn: eventTime, source: body.source ?? membership.role }).returning();
      return NextResponse.json(interval, { status: 201 });
    }
    if (action === "check_out") {
      const [interval] = await db.select().from(attendanceIntervals).where(and(eq(attendanceIntervals.employeeId, employeeId), eq(attendanceIntervals.status, "open")));
      if (!interval) throw new Error("No open attendance interval");
      const [updated] = await db.update(attendanceIntervals).set({ clockOut: eventTime, status: "completed", updatedAt: new Date() }).where(eq(attendanceIntervals.id, interval.id)).returning();
      return NextResponse.json(updated);
    }
    if (membership.role !== "administrator" && membership.role !== "manager") throw new Error("Forbidden");
    if (!employee) throw new Error("Employee not found");
    throw new Error("Unsupported attendance action");
  } catch (error) { return jsonError(error); }
}
