import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { employees, memberships, organizations, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

export function safeReturnTo(value) {
  if (typeof value !== "string" || value.length > 2048 || /[\\\u0000-\u001f\u007f]/.test(value)) {
    return "/dashboard";
  }
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\\u0000-\u001f\u007f]/.test(decoded)) return "/dashboard";
    const parsed = new URL(value, "http://hr-pulse.local");
    if (parsed.origin !== "http://hr-pulse.local" || !parsed.pathname.startsWith("/")) return "/dashboard";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/dashboard";
  }
}

export function canFoundOrganization(user) {
  return user?.app_metadata?.organization_bootstrap === true;
}

export async function getCurrentUser() {
  const supabase = await createClient();
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return { supabase, user };
  } catch (error) {
    if (error?.name === "AuthSessionMissingError") return { supabase, user: null };
    throw error;
  }
}

export async function getAccessState({ organizationId } = {}) {
  const { supabase, user } = await getCurrentUser();
  if (!user) return { supabase, user: null, profile: null, memberships: [] };

  const db = getDb();
  const [profile] = await db.select().from(profiles).where(eq(profiles.authUserId, user.id));
  if (!profile) return { supabase, user, profile: null, memberships: [] };

  const rows = await db.select({
    membership: memberships,
    organization: organizations,
    employeeId: employees.id,
  }).from(memberships)
    .innerJoin(organizations, and(
      eq(memberships.organizationId, organizations.id),
      eq(organizations.status, "active"),
    ))
    .leftJoin(employees, and(
      eq(employees.organizationId, memberships.organizationId),
      eq(employees.profileId, profile.id),
      eq(employees.status, "active"),
    ))
    .where(eq(memberships.profileId, profile.id));

  const availableMemberships = rows.filter((row) => row.membership.status === "active").map((row) => ({
    ...row.membership,
    organization: row.organization,
    employeeId: row.employeeId,
  }));
  const selected = organizationId
    ? availableMemberships.find((membership) => membership.organizationId === organizationId) ?? null
    : availableMemberships.length === 1 ? availableMemberships[0] : null;

  return { supabase, user, profile, memberships: availableMemberships, selected };
}

export async function requireOrganizationAccess(organizationId) {
  const state = await getAccessState({ organizationId });
  if (!state.user) throw new Error("Authentication required");
  if (!state.profile || state.profile.status !== "active") throw new Error("Active profile required");
  if (!state.selected) throw new Error("Organization access denied");
  return { ...state, membership: state.selected };
}
