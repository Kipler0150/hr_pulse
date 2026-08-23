"use server";

import { getDb } from "@/db";
import { memberships, organizations, profiles } from "@/db/schema";
import { validateCurrency } from "@/db/validation";
import { createClient } from "@/lib/supabase/server";

export async function createOrganization({ name, slug, timezone, defaultCurrency }) {
  if (!name || !slug || !timezone) throw new Error("name, slug, and timezone are required");
  validateCurrency(defaultCurrency);
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    throw new Error("timezone must be valid");
  }

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Authentication required");

  const db = getDb();
  return db.transaction(async (transaction) => {
    const [profile] = await transaction.insert(profiles).values({
      authUserId: user.id, email: user.email ?? "", displayName: user.user_metadata?.display_name ?? user.email ?? "",
    }).onConflictDoUpdate({ target: profiles.authUserId, set: { updatedAt: new Date() } }).returning();
    const [organization] = await transaction.insert(organizations).values({
      name, slug, timezone, defaultCurrency,
    }).returning();
    const [membership] = await transaction.insert(memberships).values({
      organizationId: organization.id, profileId: profile.id, role: "administrator",
    }).returning();
    return { organizationId: organization.id, status: organization.status, administratorMembershipId: membership.id };
  });
}
