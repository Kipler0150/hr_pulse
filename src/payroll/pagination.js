export const PAYROLL_PAGE_SIZE = 50;

export function encodeCursor(values) {
  return Buffer.from(JSON.stringify(values), "utf8").toString("base64url");
}

export function decodeCursor(value, keys) {
  if (!value || typeof value !== "string") return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!decoded || keys.some((key) => typeof decoded[key] !== "string" || !decoded[key])) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function encodeTimestampCursor(createdAt, id) {
  return encodeCursor({ createdAtMilliseconds: String(createdAt.getTime()), id });
}

export function decodeTimestampCursor(value) {
  const cursor = decodeCursor(value, ["createdAtMilliseconds", "id"]);
  if (!cursor) return null;
  const createdAtMilliseconds = Number(cursor.createdAtMilliseconds);
  if (!Number.isSafeInteger(createdAtMilliseconds)) return null;
  return { createdAtMilliseconds, id: cursor.id };
}
