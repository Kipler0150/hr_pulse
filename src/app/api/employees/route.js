import { and, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { employees } from "@/db/schema";
import { validateDate, validateUuid } from "@/db/validation";
import { jsonError, parseJson } from "@/lib/api";
import { resolveOrganizationAccess, assertRole } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";

export async function GET(request) {
  try {
    const organizationId = request.nextUrl.searchParams.get("organizationId");
    const cursor = request.nextUrl.searchParams.get("cursor");
    validateUuid(organizationId, "organizationId");
    const { membership } = await resolveOrganizationAccess({ supabase: await createClient(), db: getDb(), organizationId });
    assertRole(membership, "manager");
    if (cursor) validateUuid(cursor, "cursor");
    const db = getDb();
    const filters = [eq(employees.organizationId, organizationId)];
    const status = request.nextUrl.searchParams.get("status");
    const managerId = request.nextUrl.searchParams.get("managerId");
    if (status) filters.push(eq(employees.status, status));
    if (managerId) filters.push(eq(employees.managerId, validateUuid(managerId, "managerId")));
    if (cursor) filters.push(gt(employees.id, cursor));
    const rows = await db.select().from(employees).where(and(...filters)).orderBy(employees.id).limit(50);
    return NextResponse.json({ data: rows, nextCursor: rows.length === 50 ? rows.at(-1).id : null });
  } catch (error) { return jsonError(error); }
}

export async function POST(request) {
  try {
    const body = await parseJson(request);
    const organizationId = validateUuid(body.organizationId, "organizationId");
    const db = getDb();
    const { membership } = await resolveOrganizationAccess({ supabase: await createClient(), db, organizationId });
    assertRole(membership, "administrator");
    validateDate(body.hireDate, "hireDate");
    if (body.profileId) validateUuid(body.profileId, "profileId");
    if (body.managerId) validateUuid(body.managerId, "managerId");
    if (!body.employeeNumber || !body.legalName || !body.email) throw new Error("employeeNumber, legalName, and email are required");
    const [employee] = await db.insert(employees).values({
      organizationId, profileId: body.profileId ?? null, employeeNumber: body.employeeNumber,
      legalName: body.legalName, preferredName: body.preferredName ?? null, email: body.email,
      phone: body.phone ?? null, hireDate: body.hireDate, department: body.department ?? null,
      title: body.title ?? null, managerId: body.managerId ?? null, workLocation: body.workLocation ?? null,
    }).returning();
    return NextResponse.json(employee, { status: 201 });
  } catch (error) { return jsonError(error); }
}
