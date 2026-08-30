import * as Sentry from "@sentry/nextjs";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  organizations,
  payoutDeductionLines,
  payoutEarningLines,
  payouts,
  payrollRunAttempts,
  payrollRuns,
  payslips,
} from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { removePayslip, uploadVerifiedPayslip } from "@/lib/storage";
import { PayrollError, serializePayrollError } from "./errors";
import { sha256 } from "./fingerprint";
import { recordPayrollMetric } from "./telemetry";

const LEASE_MS = 5 * 60 * 1000;
const PAYSLIP_TEMPLATE_VERSION = 1;

function storagePath(run, payout) {
  return `payroll/${run.organizationId}/${run.id}/${payout.id}/v${PAYSLIP_TEMPLATE_VERSION}.pdf`;
}

async function claimRun({ runId, organizationId, generation, eventId }) {
  const database = getDb();
  return database.transaction(async (transaction) => {
    await transaction.execute(sql`SELECT id FROM organizations WHERE id = ${organizationId} FOR UPDATE`);
    await transaction.execute(sql`SELECT id FROM payroll_runs WHERE id = ${runId} FOR UPDATE`);
    const [organization] = await transaction.select().from(organizations).where(eq(organizations.id, organizationId));
    const [run] = await transaction.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.organizationId, organizationId)));
    if (!run || run.processingGeneration !== generation || run.status === "completed") return null;
    if (!organization || organization.status !== "active") throw new PayrollError("ORGANIZATION_INACTIVE");
    if (run.status === "processing" && run.leaseExpiresAt > new Date() && run.leaseOwner !== eventId) return null;
    if (!(["queued", "processing"].includes(run.status))) return null;

    const [attemptState] = await transaction.select({ next: sql`COALESCE(MAX(${payrollRunAttempts.attemptNumber}), 0)::int + 1` })
      .from(payrollRunAttempts).where(and(eq(payrollRunAttempts.payrollRunId, runId), eq(payrollRunAttempts.processingGeneration, generation)));
    const [attempt] = await transaction.insert(payrollRunAttempts).values({
      payrollRunId: runId,
      processingGeneration: generation,
      attemptNumber: Number(attemptState.next),
      inngestEventId: eventId,
    }).returning();
    const leaseExpiresAt = new Date(Date.now() + LEASE_MS);
    await transaction.update(payrollRuns).set({
      status: "processing", leaseOwner: eventId, leaseExpiresAt, lastProgressAt: new Date(), errorCode: null, errorGuidance: null, updatedAt: new Date(),
    }).where(eq(payrollRuns.id, runId));
    await transaction.update(payouts).set({ status: "processing", errorCode: null, errorGuidance: null, updatedAt: new Date() }).where(eq(payouts.payrollRunId, runId));
    return { ...run, status: "processing", leaseOwner: eventId, leaseExpiresAt, attemptId: attempt.id };
  });
}

async function generateBatch(run, payoutRows, eventId) {
  const database = getDb();
  const { generatePayslipPdf } = await import("./pdf");
  for (const row of payoutRows) {
    if (row.payslip.status === "generated") continue;
    const deductions = await database.select().from(payoutDeductionLines)
      .where(eq(payoutDeductionLines.payoutId, row.payout.id)).orderBy(asc(payoutDeductionLines.displayOrder));
    const earnings = await database.select().from(payoutEarningLines)
      .where(eq(payoutEarningLines.payoutId, row.payout.id)).orderBy(asc(payoutEarningLines.displayOrder));
    const bytes = await generatePayslipPdf({ run, payout: row.payout, deductions, earnings });
    const hash = sha256(bytes);
    const path = storagePath(run, row.payout);
    try {
      const uploaded = await uploadVerifiedPayslip(path, bytes, hash);
      await database.update(payslips).set({
        storagePath: path,
        templateVersion: PAYSLIP_TEMPLATE_VERSION,
        sha256: hash,
        fileSizeBytes: uploaded.size,
        mimeType: "application/pdf",
        generatedAt: new Date(),
        errorCode: null,
        errorGuidance: null,
        updatedAt: new Date(),
      }).where(eq(payslips.id, row.payslip.id));
    } catch (error) {
      await removePayslip(path).catch(() => {});
      throw error;
    }
  }
  await database.update(payrollRuns).set({
    leaseExpiresAt: new Date(Date.now() + LEASE_MS), lastProgressAt: new Date(), updatedAt: new Date(),
  }).where(and(eq(payrollRuns.id, run.id), eq(payrollRuns.leaseOwner, eventId)));
}

async function finalizeRun(run, attemptId, eventId) {
  const database = getDb();
  return database.transaction(async (transaction) => {
    await transaction.execute(sql`SELECT id FROM organizations WHERE id = ${run.organizationId} FOR UPDATE`);
    await transaction.execute(sql`SELECT id FROM payroll_runs WHERE id = ${run.id} FOR UPDATE`);
    const [organization] = await transaction.select().from(organizations).where(eq(organizations.id, run.organizationId));
    const [current] = await transaction.select().from(payrollRuns).where(eq(payrollRuns.id, run.id));
    if (!organization || organization.status !== "active") throw new PayrollError("ORGANIZATION_INACTIVE");
    if (!current || current.processingGeneration !== run.processingGeneration || current.leaseOwner !== eventId) throw new PayrollError("PROCESSING_LEASE_ACTIVE");
    const [documentState] = await transaction.select({
      total: sql`count(*)::int`,
      valid: sql`count(*) filter (where ${payslips.sha256} is not null and ${payslips.storagePath} is not null)::int`,
    }).from(payslips).innerJoin(payouts, eq(payslips.payoutId, payouts.id)).where(eq(payouts.payrollRunId, run.id));
    if (Number(documentState.total) === 0 || Number(documentState.total) !== Number(documentState.valid)) throw new PayrollError("PAYSLIP_INTEGRITY_FAILED");

    await transaction.update(payouts).set({ status: "finalized", updatedAt: new Date() }).where(eq(payouts.payrollRunId, run.id));
    await transaction.update(payslips).set({ status: "generated", immutable: true, updatedAt: new Date() })
      .where(sql`${payslips.payoutId} IN (SELECT id FROM payouts WHERE payroll_run_id = ${run.id})`);
    await transaction.update(payrollRuns).set({
      status: "completed", completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null, lastProgressAt: new Date(), updatedAt: new Date(),
    }).where(eq(payrollRuns.id, run.id));
    await transaction.update(payrollRunAttempts).set({ outcome: "succeeded", finishedAt: new Date() }).where(eq(payrollRunAttempts.id, attemptId));
    await writeAuditEvent(transaction, {
      organizationId: run.organizationId,
      action: "payroll.completed",
      entityType: "payroll_run",
      entityId: run.id,
      metadata: { processingGeneration: run.processingGeneration, calculationVersion: run.calculationVersion },
    });
  });
}

export async function processPayrollRun({ runId, organizationId, generation, eventId }) {
  const run = await claimRun({ runId, organizationId, generation, eventId });
  if (!run) return { status: "noop" };
  const startedAt = Date.now();
  const database = getDb();
  try {
    const rows = await database.select({ payout: payouts, payslip: payslips }).from(payouts)
      .innerJoin(payslips, eq(payslips.payoutId, payouts.id))
      .where(eq(payouts.payrollRunId, run.id)).orderBy(asc(payouts.employeeNumber), asc(payouts.id));
    for (let index = 0; index < rows.length; index += 25) {
      await generateBatch(run, rows.slice(index, index + 25), eventId);
    }
    await finalizeRun(run, run.attemptId, eventId);
    recordPayrollMetric({ operation: "payroll.calculation", organizationId, entityId: run.id, code: "ok", durationMs: Date.now() - startedAt });
    return { status: "completed", payoutCount: rows.length };
  } catch (error) {
    const safe = serializePayrollError(error);
    await database.update(payrollRunAttempts).set({
      outcome: "retryable_failure", finishedAt: new Date(), errorCode: safe.code, errorGuidance: safe.guidance,
    }).where(eq(payrollRunAttempts.id, run.attemptId));
    await database.update(payrollRuns).set({ leaseOwner: null, leaseExpiresAt: null, errorCode: safe.code, errorGuidance: safe.guidance, updatedAt: new Date() })
      .where(eq(payrollRuns.id, run.id));
    recordPayrollMetric({ operation: "payroll.calculation", organizationId, entityId: run.id, code: safe.code, durationMs: Date.now() - startedAt });
    Sentry.captureException(error, { tags: { organizationId, runId, attemptId: run.attemptId, code: safe.code } });
    throw error;
  }
}

export async function failPayrollRun({ runId, organizationId, generation, error }) {
  const database = getDb();
  const safe = serializePayrollError(error);
  await database.transaction(async (transaction) => {
    await transaction.execute(sql`SELECT id FROM organizations WHERE id = ${organizationId} FOR UPDATE`);
    await transaction.execute(sql`SELECT id FROM payroll_runs WHERE id = ${runId} FOR UPDATE`);
    const [run] = await transaction.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.organizationId, organizationId)));
    if (!run || run.status === "completed" || run.processingGeneration !== generation) return;
    await transaction.update(payouts).set({ status: "failed", errorCode: safe.code, errorGuidance: safe.guidance, updatedAt: new Date() }).where(eq(payouts.payrollRunId, runId));
    await transaction.update(payslips).set({ status: "failed", errorCode: safe.code, errorGuidance: safe.guidance, updatedAt: new Date() })
      .where(sql`${payslips.payoutId} IN (SELECT id FROM payouts WHERE payroll_run_id = ${runId})`);
    await transaction.update(payrollRuns).set({
      status: "failed", leaseOwner: null, leaseExpiresAt: null, errorCode: safe.code, errorGuidance: safe.guidance, updatedAt: new Date(),
    }).where(eq(payrollRuns.id, runId));
    await transaction.update(payrollRunAttempts).set({ outcome: "failed", finishedAt: new Date(), errorCode: safe.code, errorGuidance: safe.guidance })
      .where(and(eq(payrollRunAttempts.payrollRunId, runId), eq(payrollRunAttempts.processingGeneration, generation), eq(payrollRunAttempts.outcome, "retryable_failure")));
    await writeAuditEvent(transaction, {
      organizationId,
      action: "payroll.failed",
      entityType: "payroll_run",
      entityId: runId,
      metadata: { processingGeneration: generation, errorCode: safe.code },
    });
  });
  Sentry.captureException(error, { tags: { organizationId, runId, code: safe.code, exhausted: "true" } });
}
