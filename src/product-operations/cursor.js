import { createHmac, timingSafeEqual } from "node:crypto";
import { validateUuid, validateTimestamp } from "@/db/validation";
import { getProductOperationsCursorSecret } from "./config";
import { ProductOperationsError } from "./errors";

function encode(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signature(payload) {
  return createHmac("sha256", getProductOperationsCursorSecret()).update(payload).digest("base64url");
}

export function auditFilterHash(filters) {
  return createHmac("sha256", "hr-pulse-audit-filter-v1").update(JSON.stringify(filters)).digest("hex");
}

export function signAuditCursor({ organizationId, filters, createdAt, id, expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }) {
  validateUuid(organizationId, "organizationId");
  validateUuid(id, "id");
  const payload = encode({
    v: 1,
    organizationId,
    filterHash: auditFilterHash(filters),
    createdAt: validateTimestamp(createdAt, "createdAt").toISOString(),
    id,
    expiresAt: validateTimestamp(expiresAt, "expiresAt").toISOString(),
  });
  return `${payload}.${signature(payload)}`;
}

export function verifyAuditCursor(value, { organizationId, filters }) {
  try {
    if (typeof value !== "string") throw new Error();
    const [payload, provided] = value.split(".");
    if (!payload || !provided) throw new Error();
    const expected = signature(payload);
    const expectedBytes = Buffer.from(expected);
    const providedBytes = Buffer.from(provided);
    if (expectedBytes.length !== providedBytes.length || !timingSafeEqual(expectedBytes, providedBytes)) throw new Error();
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (parsed.v !== 1 || parsed.organizationId !== organizationId || parsed.filterHash !== auditFilterHash(filters)) throw new Error();
    validateUuid(parsed.id, "id");
    const createdAt = validateTimestamp(parsed.createdAt, "createdAt");
    const expiresAt = validateTimestamp(parsed.expiresAt, "expiresAt");
    if (expiresAt <= new Date()) throw new Error();
    return { id: parsed.id, createdAt };
  } catch {
    throw new ProductOperationsError("AUDIT_CURSOR_INVALID");
  }
}
