import { createHmac, timingSafeEqual } from "node:crypto";

import { getCursorSecret } from "./config";
import { SelfServiceError } from "./errors";

export const SELF_SERVICE_CURSOR_TTL_SECONDS = 15 * 60;
export const SELF_SERVICE_CURSOR_MAX_LENGTH = 4096;

function sign(payload) {
  return createHmac("sha256", getCursorSecret()).update(payload).digest("base64url");
}

export function encodeSelfServiceCursor(value) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ ...value, v: 1, issuedAt, expiresAt: issuedAt + SELF_SERVICE_CURSOR_TTL_SECONDS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSelfServiceCursor(value, expected) {
  if (!value) return null;
  if (typeof value !== "string" || value.length > SELF_SERVICE_CURSOR_MAX_LENGTH) throw new SelfServiceError("SELF_SERVICE_INVALID_CURSOR");
  const [payload, signature, ...extra] = value.split(".");
  if (!payload || !signature || extra.length) throw new SelfServiceError("SELF_SERVICE_INVALID_CURSOR");
  const supplied = Buffer.from(signature);
  const actual = Buffer.from(sign(payload));
  if (supplied.length !== actual.length || !timingSafeEqual(supplied, actual)) throw new SelfServiceError("SELF_SERVICE_INVALID_CURSOR");
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (decoded.v !== 1 || !Number.isInteger(decoded.issuedAt) || !Number.isInteger(decoded.expiresAt) || decoded.expiresAt <= decoded.issuedAt || decoded.expiresAt <= now || decoded.organizationId !== expected.organizationId || decoded.employeeId !== expected.employeeId || decoded.kind !== expected.kind || decoded.status !== expected.status || !/^\d{4}-\d{2}-\d{2}$/.test(decoded.periodEnd) || typeof decoded.id !== "string") {
      throw new Error("invalid");
    }
    return decoded;
  } catch {
    throw new SelfServiceError("SELF_SERVICE_INVALID_CURSOR");
  }
}
