import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { operationFailures, productEvents } from "@/db/schema";
import { validateTimestamp, validateUuid } from "@/db/validation";
import {
  AUDIT_ENTITY_TYPES,
  OPERATIONS,
  PRODUCT_EVENTS,
  RESULT_CATEGORIES,
  SAFE_CODES,
  WORKFLOW_AREAS,
  assertCatalogValue,
} from "./catalog";
import { ensureCorrelationId } from "./correlation";
import { analyticsSubjectKey, hasProductAnalyticsConsent } from "@/privacy/analytics";

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeDuration(value) {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > 3_600_000) throw new Error("durationMs is out of bounds");
  return value;
}

export function productEventDedupeKey(eventName, occurrenceIdentity) {
  if (typeof occurrenceIdentity !== "string" || !occurrenceIdentity.trim()) throw new Error("occurrenceIdentity is required");
  return digest(`${eventName}|${occurrenceIdentity}`);
}

export function operationFailureGroupKey({ organizationId, operation, safeCode, affectedEntityType = "", affectedEntityId = "", workflowArea = "", analyticsSubjectKey: subjectKey = "" }) {
  return digest([organizationId, operation, safeCode, affectedEntityType, affectedEntityId, workflowArea, subjectKey].join("|"));
}

export async function recordProductEvent({
  db = getDb(),
  organizationId,
  eventName,
  schemaVersion = 1,
  workflowArea = null,
  resultCategory = null,
  durationMs = null,
  dedupeKey = null,
  occurrenceIdentity = null,
  occurredAt = null,
  analyticsProfileId = null,
}) {
  validateUuid(organizationId, "organizationId");
  if (!analyticsProfileId || !(await hasProductAnalyticsConsent({ db, organizationId, profileId: analyticsProfileId }))) return null;
  assertCatalogValue(eventName, PRODUCT_EVENTS, "Product event");
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1) throw new Error("schemaVersion must be positive");
  if (workflowArea !== null) assertCatalogValue(workflowArea, WORKFLOW_AREAS, "Workflow area");
  if (resultCategory !== null) assertCatalogValue(resultCategory, RESULT_CATEGORIES, "Result category");
  const duration = safeDuration(durationMs);
  const subjectKey = analyticsSubjectKey({ organizationId, profileId: analyticsProfileId });
  const key = dedupeKey ?? productEventDedupeKey(eventName, occurrenceIdentity);
  if (typeof key !== "string" || !/^[a-f0-9]{64}$/.test(key)) throw new Error("dedupeKey must be a SHA-256 digest");
  const [inserted] = await db.insert(productEvents).values({
    organizationId,
    analyticsSubjectKey: subjectKey,
    eventName,
    schemaVersion,
    workflowArea,
    resultCategory,
    durationMs: duration,
    dedupeKey: key,
    ...(occurredAt ? { occurredAt: validateTimestamp(occurredAt, "occurredAt") } : {}),
  }).onConflictDoNothing({ target: [productEvents.organizationId, productEvents.dedupeKey] }).returning();
  if (inserted) return { event: inserted, replayed: false };
  const [existing] = await db.select().from(productEvents).where(and(eq(productEvents.organizationId, organizationId), eq(productEvents.dedupeKey, key)));
  if (!existing) throw new Error("Product event could not be recorded");
  return { event: existing, replayed: true };
}

export async function recordOperationFailure({
  db = getDb(),
  organizationId,
  operation,
  safeCode,
  affectedEntityType = null,
  affectedEntityId = null,
  workflowArea = null,
  workflowStatus = null,
  recoveryAvailable = false,
  correlationId = null,
  occurredAt = null,
  analyticsProfileId = null,
}) {
  validateUuid(organizationId, "organizationId");
  if (!analyticsProfileId || !(await hasProductAnalyticsConsent({ db, organizationId, profileId: analyticsProfileId }))) return null;
  assertCatalogValue(operation, OPERATIONS, "Operation");
  const normalizedSafeCode = SAFE_CODES.has(safeCode) ? safeCode : "OPERATION_UNAVAILABLE";
  if (affectedEntityType !== null && !AUDIT_ENTITY_TYPES.has(affectedEntityType)) throw new Error("Affected entity type is not supported");
  if (affectedEntityId !== null) validateUuid(affectedEntityId, "affectedEntityId");
  if (workflowArea !== null) assertCatalogValue(workflowArea, WORKFLOW_AREAS, "Workflow area");
  if (typeof workflowStatus !== "string" && workflowStatus !== null) throw new Error("workflowStatus is invalid");
  if (workflowStatus && workflowStatus.length > 50) throw new Error("workflowStatus is invalid");
  const representativeCorrelationId = ensureCorrelationId(correlationId);
  const now = occurredAt ? validateTimestamp(occurredAt, "occurredAt") : new Date();
  const subjectKey = analyticsSubjectKey({ organizationId, profileId: analyticsProfileId });
  const groupKey = operationFailureGroupKey({ organizationId, operation, safeCode: normalizedSafeCode, affectedEntityType: affectedEntityType ?? "", affectedEntityId: affectedEntityId ?? "", workflowArea: workflowArea ?? "", analyticsSubjectKey: subjectKey ?? "" });
  const [failure] = await db.insert(operationFailures).values({
    organizationId,
    analyticsSubjectKey: subjectKey,
    operation,
    safeCode: normalizedSafeCode,
    groupKey,
    firstSeenAt: now,
    lastSeenAt: now,
    affectedEntityType,
    affectedEntityId,
    workflowStatus,
    recoveryAvailable: Boolean(recoveryAvailable),
    correlationId: representativeCorrelationId,
  }).onConflictDoUpdate({
    target: [operationFailures.organizationId, operationFailures.groupKey],
    set: {
      lastSeenAt: sql`GREATEST(${operationFailures.lastSeenAt}, excluded.last_seen_at)`,
      occurrenceCount: sql`${operationFailures.occurrenceCount} + 1`,
      workflowStatus: sql`excluded.workflow_status`,
      recoveryAvailable: sql`excluded.recovery_available`,
      correlationId: sql`excluded.correlation_id`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    },
  }).returning();
  return { failure, replayed: false, groupKey };
}
