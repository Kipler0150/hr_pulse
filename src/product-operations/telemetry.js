import * as Sentry from "@sentry/nextjs";
import { SAFE_CODES } from "./catalog";

export function reportUnexpectedOperation(error, { operation, safeCode, organizationId, affectedEntityId = null, correlationId = null }) {
  try {
    Sentry.captureException(new Error("OPERATION_UNAVAILABLE"), {
      tags: {
        operation: operation ?? "unknown",
        safeCode: SAFE_CODES.has(safeCode) ? safeCode : "OPERATION_UNAVAILABLE",
        organizationId: organizationId ?? "unknown",
        affectedEntityId: affectedEntityId ?? "none",
        correlationId: correlationId ?? "none",
      },
    });
  } catch {}
  return error;
}
