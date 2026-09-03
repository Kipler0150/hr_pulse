import { createHmac } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { privacyConsents, profiles } from "@/db/schema";
import { validateUuid } from "@/db/validation";

import { getPrivacyAnalyticsSecret, isPrivacyEnabled } from "./config";

export function analyticsSubjectKey({ organizationId, profileId }) {
  validateUuid(organizationId, "organizationId");
  validateUuid(profileId, "profileId");
  return createHmac("sha256", getPrivacyAnalyticsSecret())
    .update(`${organizationId}:${profileId}`)
    .digest("hex");
}

export async function hasProductAnalyticsConsent({ db = getDb(), organizationId, profileId }) {
  if (!isPrivacyEnabled()) return false;
  if (!profileId) return false;
  validateUuid(organizationId, "organizationId");
  validateUuid(profileId, "profileId");
  const [current] = await db.select({ granted: privacyConsents.granted })
    .from(privacyConsents)
    .innerJoin(profiles, eq(profiles.id, privacyConsents.profileId))
    .where(and(
      eq(privacyConsents.organizationId, organizationId),
      eq(privacyConsents.profileId, profileId),
      eq(profiles.status, "active"),
      eq(privacyConsents.consentType, "product_analytics"),
      isNull(privacyConsents.supersededAt),
    ))
    .limit(1);
  return Boolean(current?.granted);
}
