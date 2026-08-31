import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { assertTimeOffEnabled, TimeOffError } from "./config";

function mapOrganization(row) {
  return { ...row, organizationId: row.id };
}

function mapMembership(row, organization, employeeId) {
  return { ...row, organizationId: row.organization_id, profileId: row.profile_id, employeeId, organization };
}

async function getAuthenticatedAccess(organizationId) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { supabase, user: null, profile: null, memberships: [] };
  const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("auth_user_id", user.id).maybeSingle();
  if (profileError || !profile) return { supabase, user, profile: profile ?? null, memberships: [] };
  const { data: membershipRows, error: membershipError } = await supabase.from("memberships").select("*").eq("profile_id", profile.id).eq("status", "active");
  if (membershipError || !membershipRows?.length) return { supabase, user, profile, memberships: [] };
  const organizationIds = membershipRows.map((row) => row.organization_id);
  const [organizationResult, employeeResult] = await Promise.all([
    supabase.from("organizations").select("*").in("id", organizationIds).eq("status", "active"),
    supabase.from("employees").select("id,organization_id,profile_id").in("organization_id", organizationIds).eq("profile_id", profile.id).eq("status", "active"),
  ]);
  if (organizationResult.error || employeeResult.error) throw new Error("organization access lookup failed");
  const organizationRows = organizationResult.data;
  const employeeRows = employeeResult.data;
  const organizationsById = new Map((organizationRows ?? []).map((row) => [row.id, mapOrganization(row)]));
  const employeesByOrganization = new Map((employeeRows ?? []).map((row) => [row.organization_id, row.id]));
  const memberships = membershipRows.filter((row) => organizationsById.has(row.organization_id)).map((row) => mapMembership(row, organizationsById.get(row.organization_id), employeesByOrganization.get(row.organization_id) ?? null));
  const selected = organizationId ? memberships.find((row) => row.organizationId === organizationId) ?? null : memberships.length === 1 ? memberships[0] : null;
  return { supabase, user, profile: { ...profile, authUserId: profile.auth_user_id, displayName: profile.display_name }, memberships, selected };
}

export async function requireTimeOffContext({ review = false } = {}) {
  assertTimeOffEnabled();
  const organizationId = (await cookies()).get("hr_pulse_organization_id")?.value;
  let state;
  try {
    state = await getAuthenticatedAccess(organizationId);
    if (!state.user || !state.profile || state.profile.status !== "active" || !state.selected) throw new Error("organization access denied");
  } catch { throw new TimeOffError("TIME_OFF_FORBIDDEN"); }
  const membership = state.selected;
  if (review && !["manager", "administrator"].includes(membership.role)) throw new TimeOffError("TIME_OFF_FORBIDDEN");
  if ((!review || membership.role === "manager") && !membership.employeeId) throw new TimeOffError("TIME_OFF_FORBIDDEN");
  return { ...state, membership, organizationId: membership.organizationId, employeeId: membership.employeeId ?? null, timezone: membership.organization.timezone };
}
