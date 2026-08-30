import { cookies } from "next/headers";

import { requireOrganizationAccess } from "@/auth/access";
import { assertOvertimeEnabled } from "./config";
import { OvertimeError } from "./errors";

export async function requireOvertimeContext() {
  assertOvertimeEnabled();
  const cookieStore = await cookies();
  const organizationId = cookieStore.get("hr_pulse_organization_id")?.value;
  try {
    const state = await requireOrganizationAccess(organizationId);
    return { ...state, organizationId: state.membership.organizationId, organization: state.membership.organization, employeeId: state.membership.employeeId ?? null };
  } catch (error) {
    if (error instanceof OvertimeError) throw error;
    throw new OvertimeError("OVERTIME_FORBIDDEN", { organizationId, cause: error });
  }
}

export async function requireOvertimeAdministrator() {
  const context = await requireOvertimeContext();
  if (context.membership.role !== "administrator") throw new OvertimeError("OVERTIME_FORBIDDEN", { organizationId: context.organizationId });
  return context;
}
