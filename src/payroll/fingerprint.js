import { createHash, randomBytes } from "node:crypto";

function canonicalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function createSourceFingerprint(source) {
  return sha256(JSON.stringify(canonicalize(source)));
}

export function createPreviewToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: sha256(token) };
}

export function hashPreviewToken(token) {
  return sha256(token);
}
