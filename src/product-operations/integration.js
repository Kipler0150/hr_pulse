import { isProductOperationsEnabled } from "./config";
import { reportUnexpectedOperation } from "./telemetry";
import { recordProductEvent, recordOperationFailure } from "./writers";

export async function recordProductMilestone(input) {
  if (!isProductOperationsEnabled()) return null;
  try {
    return await recordProductEvent(input);
  } catch (error) {
    reportUnexpectedOperation(error, {
      operation: input.operation ?? input.eventName,
      safeCode: "OPERATION_UNAVAILABLE",
      organizationId: input.organizationId,
      correlationId: input.correlationId,
    });
    return null;
  }
}

export async function recordFailureSummary(input) {
  if (!isProductOperationsEnabled()) return null;
  try {
    return await recordOperationFailure(input);
  } catch (error) {
    reportUnexpectedOperation(error, {
      operation: input.operation,
      safeCode: input.safeCode,
      organizationId: input.organizationId,
      affectedEntityId: input.affectedEntityId,
      correlationId: input.correlationId,
    });
    return null;
  }
}
