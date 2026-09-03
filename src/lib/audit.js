import { and, eq } from "drizzle-orm";
import { auditEvents, memberships, profiles } from "@/db/schema";
import { validateUuid } from "@/db/validation";
import { AUDIT_ENTITY_TYPES, AUDIT_RESULTS, LEGACY_AUDIT_ENTITY_TYPES, SAFE_CODES, normalizeAuditAction } from "@/product-operations/catalog";
import { ensureCorrelationId } from "@/product-operations/correlation";

const blockedKeys = new Set([
  "password",
  "token",
  "secret",
  "authorization",
  "requestBody",
  "ssn",
  "bankAccount",
  "email",
  "name",
  "legalName",
  "displayName",
  "amount",
  "grossAmountMinor",
  "deductionsAmountMinor",
  "netAmountMinor",
  "pdf",
  "document",
]);

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !blockedKeys.has(key))
      .map(([key, child]) => [key, sanitize(child)]),
  );
}

const SAFE_FIELD_PATTERN = /^[a-z][a-z0-9_]{0,49}$/;
const SAFE_REASON_PATTERN = /^[A-Z][A-Z0-9_.-]{0,59}$/;

export function serializeSafeAuditMetadata(metadata = {}) {
  const safe = {};
  const resultingVersion = Number(metadata.resultingVersion ?? metadata.version);
  if (Number.isSafeInteger(resultingVersion) && resultingVersion > 0) safe.resultingVersion = resultingVersion;

  const fields = Array.isArray(metadata.changedFields)
    ? metadata.changedFields
    : Array.isArray(metadata.changedFieldNames) ? metadata.changedFieldNames : [];
  const changedFields = [...new Set(fields.filter((field) => typeof field === "string" && SAFE_FIELD_PATTERN.test(field)).slice(0, 20))];
  if (changedFields.length) safe.changedFields = changedFields;

  const requestedReasons = Array.isArray(metadata.reasonCodes)
    ? metadata.reasonCodes
    : metadata.reasonCode ? [metadata.reasonCode]
      : metadata.errorCode ? [metadata.errorCode] : [];
  const reasonCodes = [...new Set(requestedReasons.filter((reason) => typeof reason === "string" && SAFE_REASON_PATTERN.test(reason) && SAFE_CODES.has(reason)).slice(0, 10))];
  if (reasonCodes.length) safe.reasonCodes = reasonCodes;
  return safe;
}

async function actorSnapshot(db, organizationId, actorProfileId, explicitLabel, explicitRole) {
  if (!actorProfileId) return { actorLabelSnapshot: null, actorRoleSnapshot: null };
  if (explicitLabel || explicitRole) return { actorLabelSnapshot: explicitLabel ?? null, actorRoleSnapshot: explicitRole ?? null };
  if (typeof db.select !== "function") return { actorLabelSnapshot: null, actorRoleSnapshot: null };
  const [[profile], [membership]] = await Promise.all([
    db.select({ displayName: profiles.displayName }).from(profiles).where(eq(profiles.id, actorProfileId)),
    db.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.organizationId, organizationId), eq(memberships.profileId, actorProfileId))),
  ]);
  return {
    actorLabelSnapshot: profile?.displayName ?? null,
    actorRoleSnapshot: membership?.role ?? null,
  };
}

export async function writeAuditEvent(db, {
  organizationId,
  actorProfileId = null,
  action,
  entityType,
  entityId,
  metadata = {},
  result = "success",
  correlationId = null,
  actorLabelSnapshot = null,
  actorRoleSnapshot = null,
}) {
  validateUuid(organizationId, "organizationId");
  validateUuid(entityId, "entityId");
  if (actorProfileId) validateUuid(actorProfileId, "actorProfileId");
  if (typeof action !== "string" || typeof entityType !== "string" || (!AUDIT_ENTITY_TYPES.has(entityType) && !LEGACY_AUDIT_ENTITY_TYPES.has(entityType))) {
    throw new Error("Audit action and entity type are required");
  }
  const normalizedAction = normalizeAuditAction(action);
  if (!AUDIT_RESULTS.has(result)) throw new Error("Audit result is not supported");
  const snapshot = await actorSnapshot(db, organizationId, actorProfileId, actorLabelSnapshot, actorRoleSnapshot);

  const [event] = await db.insert(auditEvents).values({
    organizationId,
    actorProfileId,
    action: normalizedAction,
    entityType,
    entityId,
    result,
    actorLabelSnapshot: snapshot.actorLabelSnapshot,
    actorRoleSnapshot: snapshot.actorRoleSnapshot,
    correlationId: ensureCorrelationId(correlationId),
    metadata: serializeSafeAuditMetadata(metadata),
  }).returning();
  return event;
}

export { sanitize as sanitizeAuditMetadata };
