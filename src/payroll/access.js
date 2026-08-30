import { cookies } from "next/headers";
import { requireOrganizationAccess } from "@/auth/access";
import { assertRole } from "@/lib/authorization";
import { PayrollError } from "./errors";

export async function requirePayrollAdministrator() {
  const cookieStore = await cookies();
  const organizationId = cookieStore.get("hr_pulse_organization_id")?.value;
  let state;
  try {
    state = await requireOrganizationAccess(organizationId);
  } catch {
    throw new PayrollError("PAYROLL_FORBIDDEN");
  }
  try {
    assertRole(state.membership, "administrator");
  } catch {
    throw new PayrollError("PAYROLL_FORBIDDEN");
  }
  return { ...state, organizationId: state.membership.organizationId };
}
