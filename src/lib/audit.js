import { auditEvents } from "@/db/schema";
import { validateUuid } from "@/db/validation";

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

export async function writeAuditEvent(db, {
  organizationId,
  actorProfileId = null,
  action,
  entityType,
  entityId,
  metadata = {},
}) {
  validateUuid(organizationId, "organizationId");
  validateUuid(entityId, "entityId");
  if (actorProfileId) validateUuid(actorProfileId, "actorProfileId");
  if (typeof action !== "string" || typeof entityType !== "string") {
    throw new Error("Audit action and entity type are required");
  }

  const [event] = await db.insert(auditEvents).values({
    organizationId,
    actorProfileId,
    action,
    entityType,
    entityId,
    metadata: sanitize(metadata),
  }).returning();
  return event;
}

export { sanitize as sanitizeAuditMetadata };
