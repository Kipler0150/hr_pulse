import { randomUUID } from "node:crypto";
import { validateUuid } from "@/db/validation";

export function createCorrelationId() {
  return randomUUID();
}

export function ensureCorrelationId(value) {
  return value ? validateUuid(value, "correlationId") : createCorrelationId();
}
