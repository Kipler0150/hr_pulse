import * as Sentry from "@sentry/nextjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { payrollRuns } from "@/db/schema";
import { inngest } from "@/inngest/client";
import { PayrollError } from "./errors";
import { isProductOperationsEnabled } from "@/product-operations/config";
import { recordOperationFailure } from "@/product-operations/writers";
import { writeAuditEvent } from "@/lib/audit";

export const PAYROLL_EVENT_NAME = "payroll/run.requested";
export const PAYROLL_EVENT_VERSION = 1;

export function payrollEventKey(runId, generation) {
  return `payroll-run/${runId}/generation/${generation}`;
}

export async function submitPayrollRun({ runId, organizationId, generation, analyticsProfileId = null }) {
  const database = getDb();
  try {
    const response = await inngest.send({
      id: payrollEventKey(runId, generation),
      name: PAYROLL_EVENT_NAME,
      data: { runId, organizationId, generation, eventVersion: PAYROLL_EVENT_VERSION },
    });
    await database.update(payrollRuns).set({
      queueStatus: "submitted",
      queueSubmittedAt: new Date(),
      queueEventId: response.ids?.[0] ?? null,
      queueErrorCode: null,
      updatedAt: new Date(),
    }).where(eq(payrollRuns.id, runId));
    if (isProductOperationsEnabled()) await writeAuditEvent(database, {
      organizationId,
      action: "payroll.queued",
      entityType: "payroll_run",
      entityId: runId,
    });
    return { submitted: true, eventId: response.ids?.[0] ?? null };
  } catch (error) {
    await database.update(payrollRuns).set({
      queueStatus: "failed",
      queueErrorCode: "QUEUE_DELIVERY_FAILED",
      updatedAt: new Date(),
    }).where(eq(payrollRuns.id, runId));
    if (isProductOperationsEnabled()) await recordOperationFailure({
      db: database,
      organizationId,
      operation: "payroll.queue",
      safeCode: "QUEUE_DELIVERY_FAILED",
      affectedEntityType: "payroll_run",
      affectedEntityId: runId,
      workflowArea: "payroll",
      workflowStatus: "queued",
      recoveryAvailable: true,
      analyticsProfileId,
    });
    Sentry.captureException(error, { tags: { organizationId, runId, code: "QUEUE_DELIVERY_FAILED" } });
    throw new PayrollError("QUEUE_DELIVERY_FAILED", { cause: error });
  }
}
