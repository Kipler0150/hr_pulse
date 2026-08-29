import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { assertAttendanceEnabled } from "./config";
import { AttendanceError } from "./errors";
import { reportAttendanceFailure } from "./telemetry";

function mapOrganization(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    timezone: row.timezone,
    defaultCurrency: row.default_currency,
  };
}

function mapMembership(row, employeeId) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    profileId: row.profile_id,
    role: row.role,
    status: row.status,
    employeeId: employeeId ?? null,
    organization: mapOrganization(row.organizations),
  };
}

export async function getAttendanceAccessState() {
  let organizationId;
  try {
    const supabase = await createClient();
    const cookieStore = await cookies();
    organizationId = cookieStore.get("hr_pulse_organization_id")?.value;
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError && authError.name !== "AuthSessionMissingError") throw authError;
    const user = authData?.user ?? null;
    if (!user) return { supabase, user: null, profile: null, memberships: [], selected: null };

    const { data: profileRow, error: profileError } = await supabase
      .from("profiles")
      .select("id,email,display_name,status")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profileRow) return { supabase, user, profile: null, memberships: [], selected: null };

    const { data: membershipRows, error: membershipError } = await supabase
      .from("memberships")
      .select("id,organization_id,profile_id,role,status,organizations!inner(id,name,slug,status,timezone,default_currency)")
      .eq("profile_id", profileRow.id)
      .eq("status", "active")
      .eq("organizations.status", "active");
    if (membershipError) throw membershipError;

    const { data: employeeRows, error: employeeError } = await supabase
      .from("employees")
      .select("id,organization_id,status")
      .eq("profile_id", profileRow.id);
    if (employeeError) throw employeeError;
    const employeesByOrganization = new Map((employeeRows ?? []).map((row) => [row.organization_id, row]));
    const memberships = (membershipRows ?? []).map((row) => {
      const employee = employeesByOrganization.get(row.organization_id);
      return mapMembership(row, employee?.status === "active" ? employee.id : null);
    });

    const selected = organizationId
      ? memberships.find((membership) => membership.organizationId === organizationId) ?? null
      : null;

    return {
      supabase,
      user,
      profile: {
        id: profileRow.id,
        email: profileRow.email,
        displayName: profileRow.display_name,
        status: profileRow.status,
      },
      memberships,
      selected,
    };
  } catch (error) {
    const safe = error instanceof AttendanceError
      ? error
      : new AttendanceError("ATTENDANCE_REQUEST_FAILED");
    reportAttendanceFailure(safe, { action: "attendance.access", organizationId });
    throw safe;
  }
}

export async function requireAttendanceContext({ review = false } = {}) {
  assertAttendanceEnabled();
  let state;
  try {
    state = await getAttendanceAccessState();
  } catch (error) {
    throw error instanceof AttendanceError ? error : new AttendanceError("ATTENDANCE_REQUEST_FAILED");
  }

  if (!state.user || !state.profile || state.profile.status !== "active" || !state.selected) {
    throw new AttendanceError("ATTENDANCE_FORBIDDEN");
  }

  const organizationId = state.selected.organizationId;
  if (review) {
    if (!["manager", "administrator"].includes(state.selected.role)) {
      throw new AttendanceError("ATTENDANCE_FORBIDDEN", { organizationId });
    }
  } else {
    if (state.selected.role !== "employee") {
      throw new AttendanceError("ATTENDANCE_FORBIDDEN", { organizationId });
    }
    if (!state.selected.employeeId) {
      throw new AttendanceError("EMPLOYEE_NOT_ELIGIBLE", { organizationId });
    }
  }

  return {
    ...state,
    employeeId: state.selected.employeeId,
    organizationId,
    timezone: state.selected.organization.timezone,
  };
}
