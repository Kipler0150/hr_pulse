import * as Sentry from "@sentry/nextjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { payrollRuns } from "@/db/schema";
import { inngest } from "@/inngest/client";
import { PayrollError } from "./errors";

export const PAYROLL_EVENT_NAME = "payroll/run.requested";
export const PAYROLL_EVENT_VERSION = 1;

export function payrollEventKey(runId, generation) {
  return `payroll-run/${runId}/generation/${generation}`;
}

export async function submitPayrollRun({ runId, organizationId, generation }) {
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
    return { submitted: true, eventId: response.ids?.[0] ?? null };
  } catch (error) {
    await database.update(payrollRuns).set({
      queueStatus: "failed",
      queueErrorCode: "QUEUE_DELIVERY_FAILED",
      updatedAt: new Date(),
    }).where(eq(payrollRuns.id, runId));
    Sentry.captureException(error, { tags: { organizationId, runId, code: "QUEUE_DELIVERY_FAILED" } });
    throw new PayrollError("QUEUE_DELIVERY_FAILED", { cause: error });
  }
}
