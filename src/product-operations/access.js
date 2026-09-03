import { cookies } from "next/headers";
import { getAccessState } from "@/auth/access";
import { validateUuid } from "@/db/validation";
import { assertProductOperationsEnabled } from "./config";
import { ProductOperationsError } from "./errors";

export async function requireProductOperationsContext() {
  try {
    assertProductOperationsEnabled();
    const cookieStore = await cookies();
    const selectedId = cookieStore.get("hr_pulse_organization_id")?.value;
    if (selectedId) validateUuid(selectedId, "organizationId");
    const state = await getAccessState(selectedId ? { organizationId: selectedId } : undefined);
    if (!state.user || !state.profile || state.profile.status !== "active" || !state.selected || state.selected.role !== "administrator") {
      throw new ProductOperationsError("PRODUCT_OPERATIONS_FORBIDDEN");
    }
    return {
      ...state,
      organizationId: state.selected.organizationId,
      membership: state.selected,
      organization: state.selected.organization,
      timezone: state.selected.organization.timezone,
    };
  } catch (error) {
    if (error instanceof ProductOperationsError) throw error;
    if (error?.code === "PRODUCT_OPERATIONS_DISABLED") throw error;
    throw new ProductOperationsError("PRODUCT_OPERATIONS_FORBIDDEN", error);
  }
}
