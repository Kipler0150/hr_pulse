import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  count: vi.fn(),
  distribution: vi.fn(),
  getDb: vi.fn(),
  generatePayslipPdf: vi.fn(),
  uploadVerifiedPayslip: vi.fn(),
  removePayslip: vi.fn(),
  writeAuditEvent: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException, metrics: { count: mocks.count, distribution: mocks.distribution } }));
vi.mock("@/db", () => ({ getDb: mocks.getDb }));
vi.mock("./pdf", () => ({ generatePayslipPdf: mocks.generatePayslipPdf }));
vi.mock("@/lib/storage", () => ({ uploadVerifiedPayslip: mocks.uploadVerifiedPayslip, removePayslip: mocks.removePayslip }));
vi.mock("@/lib/audit", () => ({ writeAuditEvent: mocks.writeAuditEvent }));

import { PayrollError } from "./errors";
import { failPayrollRun, processPayrollRun } from "./processing";

const organizationId = "123e4567-e89b-12d3-a456-426614174000";
const runId = "123e4567-e89b-12d3-a456-426614174001";

function createDatabase({ runStatus = "queued", payoutCount = 1, uploadFails = false } = {}) {
  const updates = [];
  const payoutRows = Array.from({ length: payoutCount }, (_, index) => ({
    payout: { id: `payout-${index}`, employeeNumber: `E-${String(index).padStart(3, "0")}` },
    payslip: { id: `payslip-${index}`, status: "pending" },
  }));
  const run = {
    id: runId,
    organizationId,
    processingGeneration: 1,
    calculationVersion: "fixed-pay-v1",
    status: runStatus,
    leaseOwner: null,
    leaseExpiresAt: null,
  };

  function select(fields = {}) {
    let tableName;
    const chain = {
      from: (table) => { tableName = getTableName(table); return chain; },
      innerJoin: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      then: (resolve, reject) => {
        let rows = [];
        if (tableName === "organizations") rows = [{ id: organizationId, status: "active" }];
        if (tableName === "payroll_runs") rows = [run];
        if (tableName === "payroll_run_attempts") rows = fields.next ? [{ next: 1 }] : [];
        if (tableName === "payouts") rows = payoutRows;
        if (tableName === "payout_deduction_lines") rows = [];
        if (tableName === "payslips" && fields.total) rows = [{ total: payoutCount, valid: payoutCount }];
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
    return chain;
  }

  function update(table) {
    const tableName = getTableName(table);
    return {
      set: (values) => {
        updates.push({ tableName, values });
        if (tableName === "payroll_runs") Object.assign(run, values);
        return { where: () => Promise.resolve([]) };
      },
    };
  }

  function insert(table) {
    const tableName = getTableName(table);
    return {
      values: () => ({ returning: () => Promise.resolve(tableName === "payroll_run_attempts" ? [{ id: "attempt-id" }] : [{}]) }),
    };
  }

  const transaction = { execute: vi.fn().mockResolvedValue([]), select, update, insert };
  const database = { select, update, insert, transaction: (callback) => callback(transaction), updates };
  mocks.generatePayslipPdf.mockResolvedValue(Buffer.from("pdf bytes"));
  if (uploadFails) mocks.uploadVerifiedPayslip.mockRejectedValue(new PayrollError("PAYSLIP_INTEGRITY_FAILED"));
  else mocks.uploadVerifiedPayslip.mockResolvedValue({ size: 9 });
  return database;
}

describe("payroll processing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.removePayslip.mockResolvedValue(undefined);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T00:00:00.000Z"));
  });

  it("processes frozen payouts in bounded groups and completes every record together, covers: AC-5, AC-6, and AC-11", async () => {
    const database = createDatabase({ payoutCount: 26 });
    mocks.getDb.mockReturnValue(database);

    await expect(processPayrollRun({ runId, organizationId, generation: 1, eventId: "event-id" }))
      .resolves.toEqual({ status: "completed", payoutCount: 26 });

    expect(mocks.generatePayslipPdf).toHaveBeenCalledTimes(26);
    expect(mocks.uploadVerifiedPayslip).toHaveBeenCalledTimes(26);
    const progressRenewals = database.updates.filter(({ tableName, values }) => tableName === "payroll_runs" && values.leaseExpiresAt && values.lastProgressAt);
    expect(progressRenewals).toHaveLength(3);
    expect(database.updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ tableName: "payouts", values: expect.objectContaining({ status: "finalized" }) }),
      expect.objectContaining({ tableName: "payslips", values: expect.objectContaining({ status: "generated", immutable: true }) }),
      expect.objectContaining({ tableName: "payroll_runs", values: expect.objectContaining({ status: "completed", leaseOwner: null }) }),
    ]));
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "payroll.completed", entityId: runId }));
  });

  it("ignores a duplicate event for a completed generation, covers: AC-8 and AC-11", async () => {
    const database = createDatabase({ runStatus: "completed" });
    mocks.getDb.mockReturnValue(database);

    await expect(processPayrollRun({ runId, organizationId, generation: 1, eventId: "duplicate-event" }))
      .resolves.toEqual({ status: "noop" });
    expect(mocks.uploadVerifiedPayslip).not.toHaveBeenCalled();
  });

  it("records a retryable attempt and releases its lease after document failure, covers: AC-7, AC-8, and AC-11", async () => {
    const database = createDatabase({ uploadFails: true });
    mocks.getDb.mockReturnValue(database);

    await expect(processPayrollRun({ runId, organizationId, generation: 1, eventId: "event-id" }))
      .rejects.toMatchObject({ code: "PAYSLIP_INTEGRITY_FAILED" });

    expect(mocks.removePayslip).toHaveBeenCalled();
    expect(database.updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ tableName: "payroll_run_attempts", values: expect.objectContaining({ outcome: "retryable_failure", errorCode: "PAYSLIP_INTEGRITY_FAILED" }) }),
      expect.objectContaining({ tableName: "payroll_runs", values: expect.objectContaining({ leaseOwner: null, leaseExpiresAt: null, errorCode: "PAYSLIP_INTEGRITY_FAILED" }) }),
    ]));
    expect(mocks.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { organizationId, runId, attemptId: "attempt-id", code: "PAYSLIP_INTEGRITY_FAILED" },
    });
  });

  it("moves an exhausted generation to one safe terminal failure, covers: AC-8, AC-9, and AC-11", async () => {
    const database = createDatabase({ runStatus: "processing" });
    mocks.getDb.mockReturnValue(database);
    const error = new PayrollError("PAYROLL_PROCESSING_FAILED");

    await failPayrollRun({ runId, organizationId, generation: 1, error });

    expect(database.updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ tableName: "payouts", values: expect.objectContaining({ status: "failed" }) }),
      expect.objectContaining({ tableName: "payslips", values: expect.objectContaining({ status: "failed" }) }),
      expect.objectContaining({ tableName: "payroll_runs", values: expect.objectContaining({ status: "failed", leaseOwner: null }) }),
      expect.objectContaining({ tableName: "payroll_run_attempts", values: expect.objectContaining({ outcome: "failed" }) }),
    ]));
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "payroll.failed" }));
    expect(mocks.captureException).toHaveBeenCalledWith(error, { tags: { organizationId, runId, code: "PAYROLL_PROCESSING_FAILED", exhausted: "true" } });
  });
});
