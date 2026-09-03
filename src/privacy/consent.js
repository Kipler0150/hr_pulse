import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { privacyConsents } from "@/db/schema";
import { validateUuid } from "@/db/validation";
import { writeAuditEvent } from "@/lib/audit";

import { PRIVACY_POLICY_VERSION } from "./config";
import { PrivacyError } from "./errors";

function assertIdempotencyKey(value) {
  validateUuid(value, "idempotencyKey");
  return value;
}

export async function getCurrentProductAnalyticsConsent({ db = getDb(), organizationId, profileId }) {
  validateUuid(organizationId, "organizationId");
  validateUuid(profileId, "profileId");
  const [row] = await db.select().from(privacyConsents)
    .where(and(
      eq(privacyConsents.organizationId, organizationId),
      eq(privacyConsents.profileId, profileId),
      eq(privacyConsents.consentType, "product_analytics"),
      isNull(privacyConsents.supersededAt),
    ))
    .limit(1);
  return row ?? null;
}

export async function getConsentHistory({ db = getDb(), organizationId, profileId, limit = 12 }) {
  validateUuid(organizationId, "organizationId");
  validateUuid(profileId, "profileId");
  return db.select().from(privacyConsents)
    .where(and(eq(privacyConsents.organizationId, organizationId), eq(privacyConsents.profileId, profileId)))
    .orderBy(desc(privacyConsents.recordedAt), desc(privacyConsents.id))
    .limit(Math.min(Math.max(Number(limit) || 1, 1), 24));
}

export async function saveProductAnalyticsConsent({ db = getDb(), organizationId, profileId, granted, idempotencyKey, policyVersion = PRIVACY_POLICY_VERSION }) {
  validateUuid(organizationId, "organizationId");
  validateUuid(profileId, "profileId");
  const key = assertIdempotencyKey(idempotencyKey);
  if (typeof granted !== "boolean") throw new PrivacyError("PRIVACY_INVALID_INPUT");
  if (policyVersion !== PRIVACY_POLICY_VERSION) throw new PrivacyError("PRIVACY_INVALID_INPUT");

  try {
    return await db.transaction(async (tx) => {
      const [replayed] = await tx.select().from(privacyConsents).where(and(
        eq(privacyConsents.organizationId, organizationId),
        eq(privacyConsents.profileId, profileId),
        eq(privacyConsents.idempotencyKey, key),
      )).limit(1);
      if (replayed) {
        if (replayed.consentType !== "product_analytics" || replayed.granted !== granted || replayed.policyVersion !== policyVersion) {
          throw new PrivacyError("PRIVACY_IDEMPOTENCY_CONFLICT");
        }
        return { consent: replayed, replayed: true };
      }

      const now = new Date();
      await tx.update(privacyConsents).set({ supersededAt: now }).where(and(
        eq(privacyConsents.organizationId, organizationId),
        eq(privacyConsents.profileId, profileId),
        eq(privacyConsents.consentType, "product_analytics"),
        isNull(privacyConsents.supersededAt),
      ));
      const [consent] = await tx.insert(privacyConsents).values({
        organizationId,
        profileId,
        consentType: "product_analytics",
        granted,
        policyVersion,
        idempotencyKey: key,
        recordedAt: now,
      }).returning();
      await writeAuditEvent(tx, {
        organizationId,
        actorProfileId: profileId,
        action: "privacy.consent_changed",
        entityType: "profile",
        entityId: profileId,
        metadata: { changedFields: ["analytics_consent"] },
      });
      return { consent, replayed: false };
    });
  } catch (error) {
    if (error instanceof PrivacyError) throw error;
    throw new PrivacyError("PRIVACY_UNAVAILABLE", error);
  }
}
