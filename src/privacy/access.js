import { cookies } from "next/headers";

import { getAccessState } from "@/auth/access";
import { validateUuid } from "@/db/validation";

import { assertPrivacyEnabled } from "./config";
import { PrivacyError } from "./errors";

async function selectedOrganizationId() {
  const cookieStore = await cookies();
  const value = cookieStore.get("hr_pulse_organization_id")?.value;
  if (value) validateUuid(value, "organizationId");
  return value ?? null;
}

export async function getPrivacyAccessState() {
  assertPrivacyEnabled();
  const organizationId = await selectedOrganizationId();
  return getAccessState(organizationId ? { organizationId } : undefined);
}

export async function requirePrivacyContext({ administrator = false, state = null } = {}) {
  try {
    assertPrivacyEnabled();
    const accessState = state ?? await getPrivacyAccessState();
    if (!accessState.user || !accessState.profile || accessState.profile.status !== "active" || !accessState.selected) {
      throw new PrivacyError("PRIVACY_FORBIDDEN");
    }
    if (administrator && accessState.selected.role !== "administrator") {
      throw new PrivacyError("PRIVACY_FORBIDDEN");
    }
    return {
      ...accessState,
      organizationId: accessState.selected.organizationId,
      organization: accessState.selected.organization,
      membership: accessState.selected,
    };
  } catch (error) {
    if (error instanceof PrivacyError) throw error;
    if (error?.code === "PRIVACY_DISABLED") throw error;
    throw new PrivacyError("PRIVACY_FORBIDDEN", error);
  }
}
