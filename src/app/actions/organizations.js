"use server";

import { getDb } from "@/db";
import { eq, sql } from "drizzle-orm";
import { memberships, organizations, payrollSchedules, profiles } from "@/db/schema";
import { validateCurrency, validateDate, validatePayFrequency, validateTimezone } from "@/db/validation";
import { getCurrencyExponent } from "@/payroll/currency";
import { writeAuditEvent } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { canFoundOrganization } from "@/auth/access";

function slugify(value) {
  const slug = value.toLocaleLowerCase("en").trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
  return slug || "organization";
}

function validateSchedule({ frequency, effectiveStartDate, anchorStartDate }) {
  validatePayFrequency(frequency, "frequency");
  validateDate(effectiveStartDate, "effectiveStartDate");
  const day = Number(effectiveStartDate.slice(-2));
  if (frequency === "weekly" || frequency === "biweekly") {
    validateDate(anchorStartDate, "anchorStartDate");
    if (anchorStartDate !== effectiveStartDate) throw new Error("the first anchored period must start on the effective date");
    return;
  }
  if (anchorStartDate) throw new Error("anchorStartDate is only used for weekly schedules");
  if (frequency === "semimonthly" && ![1, 16].includes(day)) throw new Error("semimonthly schedules must start on day 1 or 16");
  if (frequency === "monthly" && day !== 1) throw new Error("monthly schedules must start on day 1");
}

export async function createOrganization({ name, timezone, defaultCurrency, frequency, effectiveStartDate, anchorStartDate = null }) {
  if (!name || !timezone) throw new Error("name and timezone are required");
  validateCurrency(defaultCurrency);
  getCurrencyExponent(defaultCurrency);
  validateTimezone(timezone);
  validateSchedule({ frequency, effectiveStartDate, anchorStartDate });

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Authentication required");
  if (!canFoundOrganization(user)) throw new Error("Organization founding is not available for this account");

  const db = getDb();
  return db.transaction(async (transaction) => {
    const [profile] = await transaction.select().from(profiles).where(eq(profiles.authUserId, user.id));
    if (!profile || profile.status !== "active") throw new Error("An active provisioned profile is required");
    const [existingFounder] = await transaction.select({ id: organizations.id }).from(organizations).where(eq(organizations.foundingProfileId, profile.id));
    const [membershipCount] = await transaction.select({ count: sql`count(*)::int` }).from(memberships).where(eq(memberships.profileId, profile.id));
    if (existingFounder || Number(membershipCount?.count ?? 0) > 0) throw new Error("This profile cannot found another organization");

    const baseSlug = slugify(name);
    let slug = baseSlug;
    for (let suffix = 2; ; suffix += 1) {
      const [existingSlug] = await transaction.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug));
      if (!existingSlug) break;
      slug = `${baseSlug.slice(0, 90 - String(suffix).length - 1)}-${suffix}`;
    }
    const [organization] = await transaction.insert(organizations).values({
      name: name.trim(), slug, timezone, defaultCurrency, foundingProfileId: profile.id,
    }).returning();
    const [membership] = await transaction.insert(memberships).values({
      organizationId: organization.id, profileId: profile.id, role: "administrator", status: "active",
    }).returning();
    const [schedule] = await transaction.insert(payrollSchedules).values({
      organizationId: organization.id,
      frequency,
      effectiveStartDate,
      anchorStartDate: frequency === "weekly" || frequency === "biweekly" ? anchorStartDate : null,
    }).returning();
    await writeAuditEvent(transaction, {
      organizationId: organization.id,
      actorProfileId: profile.id,
      action: "organization.founded",
      entityType: "organization",
      entityId: organization.id,
      metadata: { scheduleId: schedule.id, scheduleVersion: schedule.version },
    });
    return { organizationId: organization.id, slug, status: organization.status, administratorMembershipId: membership.id, payrollScheduleId: schedule.id };
  });
}
