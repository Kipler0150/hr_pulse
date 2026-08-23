import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { employees, memberships, organizations, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

export function safeReturnTo(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }
  return value;
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
    ))
    .where(eq(memberships.profileId, profile.id));

  const availableMemberships = rows.map((row) => ({
    ...row.membership,
    organization: row.organization,
    employeeId: row.employeeId,
  }));
  const selected = organizationId
    ? availableMemberships.find((membership) => membership.organizationId === organizationId) ?? null
    : null;

  return { supabase, user, profile, memberships: availableMemberships, selected };
}

export async function requireOrganizationAccess(organizationId) {
  const state = await getAccessState({ organizationId });
  if (!state.user) throw new Error("Authentication required");
  if (!state.profile || state.profile.status !== "active") throw new Error("Active profile required");
  if (!state.selected) throw new Error("Organization access denied");
  return { ...state, membership: state.selected };
}