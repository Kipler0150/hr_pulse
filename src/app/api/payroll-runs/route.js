import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { organizations, payrollRuns } from "@/db/schema";
import { validateCurrency, validateDateRange, validateUuid } from "@/db/validation";
import { jsonError, parseJson } from "@/lib/api";
import { resolveOrganizationAccess, assertRole } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";

export async function POST(request) {
  try {
    const body = await parseJson(request);
    const organizationId = validateUuid(body.organizationId, "organizationId");
    validateDateRange(body.periodStart, body.periodEnd);
    if (!body.idempotencyKey) throw new Error("idempotencyKey is required");
    const db = getDb();
    const { membership } = await resolveOrganizationAccess({ supabase: await createClient(), db, organizationId });
    assertRole(membership, "administrator");
    const [organization] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
    const currency = validateCurrency(body.currency ?? organization.defaultCurrency);
    const [run] = await db.insert(payrollRuns).values({
      organizationId, periodStart: body.periodStart, periodEnd: body.periodEnd,
      currency, idempotencyKey: body.idempotencyKey,
    }).returning();
    return NextResponse.json(run, { status: 201 });
  } catch (error) { return jsonError(error); }
}
