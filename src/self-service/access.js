import { cookies } from "next/headers";

import { requireOrganizationAccess } from "@/auth/access";
import { employees } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { assertSelfServiceEnabled, assertSelfServiceTestFailure } from "./config";
import { SelfServiceError } from "./errors";

export async function requireSelfServiceContext() {
  assertSelfServiceEnabled();
  assertSelfServiceTestFailure("access");
  const organizationId = (await cookies()).get("hr_pulse_organization_id")?.value;
  let state;
  try {
    state = await requireOrganizationAccess(organizationId);
  } catch (cause) {
    throw new SelfServiceError("SELF_SERVICE_ACCESS_UNAVAILABLE", { cause });
  }
  const [employee] = await getDb().select().from(employees).where(and(
    eq(employees.organizationId, state.membership.organizationId),
    eq(employees.profileId, state.profile.id),
    eq(employees.status, "active"),
  ));
  if (!employee) throw new SelfServiceError("SELF_SERVICE_ACCESS_UNAVAILABLE");
  return { ...state, organizationId: state.membership.organizationId, employee };
}
