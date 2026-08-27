import { and, eq } from "drizzle-orm";
import { employees, memberships, organizations, profiles } from "@/db/schema";
import { validateUuid } from "@/db/validation";

const roleRank = { employee: 1, manager: 2, administrator: 3 };

export async function resolveOrganizationAccess({ supabase, db, organizationId }) {
  validateUuid(organizationId, "organizationId");
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Authentication required");

  const [profile] = await db.select().from(profiles).where(eq(profiles.authUserId, user.id));
  if (!profile || profile.status !== "active") throw new Error("Active profile required");

  const [membership] = await db
    .select()
    .from(memberships)
    .where(and(
      eq(memberships.organizationId, organizationId),
      eq(memberships.profileId, profile.id),
      eq(memberships.status, "active"),
    ));
  if (!membership) throw new Error("Organization access denied");

  const [organization] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  if (!organization || organization.status !== "active") throw new Error("Organization access denied");

  const [employee] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.organizationId, organizationId), eq(employees.profileId, profile.id)));
  return { user, profile, organization, membership: { ...membership, employeeId: employee?.id ?? null } };
}

export function assertRole(membership, requiredRole) {
  if (!membership || roleRank[membership.role] < roleRank[requiredRole]) {
    throw new Error("Forbidden");
  }
  return membership;
}

export async function assertEmployeeAccess({ db, membership, employeeId, write = false }) {
  validateUuid(employeeId, "employeeId");
  const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId));
  if (!employee) throw new Error("Employee not found");

  if (membership.role === "administrator") return employee;
  if (membership.role === "manager" && employee.managerId === membership.employeeId) return employee;
  if (membership.role === "employee" && employee.profileId === membership.profileId && write) return employee;
  if (membership.role === "employee" && employee.profileId === membership.profileId) return employee;
  throw new Error("Forbidden");
}
