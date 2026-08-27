import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  requirePayrollAdministrator: vi.fn(),
  writeAuditEvent: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  confirmPayroll: vi.fn(),
  getPayrollRun: vi.fn(),
  previewPayroll: vi.fn(),
  submitPayrollRun: vi.fn(),
}));

vi.mock("@/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/payroll/access", () => ({ requirePayrollAdministrator: mocks.requirePayrollAdministrator }));
vi.mock("@/lib/audit", () => ({ writeAuditEvent: mocks.writeAuditEvent }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/payroll/service", () => ({ confirmPayroll: mocks.confirmPayroll, getPayrollRun: mocks.getPayrollRun, previewPayroll: mocks.previewPayroll }));
vi.mock("@/payroll/queue", () => ({ submitPayrollRun: mocks.submitPayrollRun }));

import { confirmPayrollAction, deactivateEmployeeAction } from "./payroll";

const organizationId = "123e4567-e89b-12d3-a456-426614174000";
const profileId = "123e4567-e89b-12d3-a456-426614174001";
const employeeId = "123e4567-e89b-12d3-a456-426614174002";

function employeeTransaction(result) {
  return {
    transaction: async (callback) => callback({
      update: () => ({
        set: () => ({
          where: () => ({ returning: () => Promise.resolve(result) }),
        }),
      }),
    }),
  };
}

function stateTransitionDatabase(run) {
  const updates = [];
  const transaction = {
    execute: vi.fn().mockResolvedValue([]),
    select: () => ({ from: () => ({ where: () => Promise.resolve([run]) }) }),
    update: (table) => ({
      set: (values) => {
        updates.push({ tableName: getTableName(table), values });
        const result = {
          returning: () => Promise.resolve([{ ...run, ...values }]),
          then: (resolve, reject) => Promise.resolve([]).then(resolve, reject),
        };
        return { where: () => result };
      },
    }),
  };
  return { transaction: (callback) => callback(transaction), updates };
}

describe("payroll server actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
    mocks.requirePayrollAdministrator.mockResolvedValue({ organizationId, profile: { id: profileId } });
  });

  it("deactivates one active organization employee, audits it, and refreshes every affected screen, covers: AC-2, AC-9, and AC-10", async () => {
    mocks.getDb.mockReturnValue(employeeTransaction([{ id: employeeId, status: "inactive" }]));
    const formData = new FormData();
    formData.set("employeeId", employeeId);

    await deactivateEmployeeAction(formData);

    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(expect.anything(), {
      organizationId,
      actorProfileId: profileId,
      action: "employee.deactivated",
      entityType: "employee",
      entityId: employeeId,
    });
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/payroll/employees"],
      [`/payroll/employees/${employeeId}`],
      ["/payroll"],
    ]);
  });

  it("rejects a repeated or cross organization deactivation without a duplicate audit event, covers: AC-2, AC-8, and AC-9", async () => {
    mocks.getDb.mockReturnValue(employeeTransaction([]));
    const formData = new FormData();
    formData.set("employeeId", employeeId);

    await expect(deactivateEmployeeAction(formData)).rejects.toThrow("This employee is not active or could not be found");
    expect(mocks.writeAuditEvent).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("submits a newly confirmed frozen run exactly once, covers: AC-4 and AC-5", async () => {
    mocks.confirmPayroll.mockResolvedValue({ duplicate: false, run: { id: "run-id", status: "queued", processingGeneration: 1 } });
    mocks.submitPayrollRun.mockResolvedValue({ submitted: true });
    const formData = new FormData();
    formData.set("previewToken", "opaque-preview-token");

    await expect(confirmPayrollAction(null, formData)).resolves.toEqual({ success: true, runId: "run-id", duplicate: false, queueWarning: null });
    expect(mocks.confirmPayroll).toHaveBeenCalledWith({ organizationId, actorProfileId: profileId, token: "opaque-preview-token" });
    expect(mocks.submitPayrollRun).toHaveBeenCalledOnce();
  });

  it("returns an existing duplicate run without another queue event, covers: AC-4, AC-5, and AC-8", async () => {
    mocks.confirmPayroll.mockResolvedValue({ duplicate: true, run: { id: "run-id", status: "queued", processingGeneration: 1 } });
    const formData = new FormData();
    formData.set("previewToken", "opaque-preview-token");

    await expect(confirmPayrollAction(null, formData)).resolves.toMatchObject({ success: true, runId: "run-id", duplicate: true });
    expect(mocks.submitPayrollRun).not.toHaveBeenCalled();
  });

  it("keeps a confirmed run successful with safe queue recovery guidance when delivery fails, covers: AC-5 and AC-8", async () => {
    mocks.confirmPayroll.mockResolvedValue({ duplicate: false, run: { id: "run-id", status: "queued", processingGeneration: 1 } });
    mocks.submitPayrollRun.mockRejectedValue(Object.assign(new Error("provider secret"), { code: "QUEUE_DELIVERY_FAILED" }));
    const formData = new FormData();
    formData.set("previewToken", "opaque-preview-token");

    const result = await confirmPayrollAction(null, formData);

    expect(result.success).toBe(true);
    expect(result.queueWarning).toMatchObject({ code: "PAYROLL_PROCESSING_FAILED", retryable: true });
    expect(JSON.stringify(result.queueWarning)).not.toContain("provider secret");
  });

  it("recovers only a delayed processing run after its lease expires, covers: AC-5, AC-8, and AC-11", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T01:00:00.000Z"));
    const database = stateTransitionDatabase({
      id: "run-id",
      status: "processing",
      processingGeneration: 1,
      updatedAt: new Date("2026-08-26T00:00:00.000Z"),
      lastProgressAt: new Date("2026-08-26T00:20:00.000Z"),
      leaseExpiresAt: new Date("2026-08-26T00:30:00.000Z"),
    });
    mocks.getDb.mockReturnValue(database);
    const formData = new FormData();
    formData.set("runId", "123e4567-e89b-12d3-a456-426614174003");

    await (await import("./payroll")).recoverPayrollAction(formData);

    expect(database.updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ tableName: "payouts", values: expect.objectContaining({ status: "failed" }) }),
      expect.objectContaining({ tableName: "payslips", values: expect.objectContaining({ status: "failed" }) }),
      expect.objectContaining({ tableName: "payroll_runs", values: expect.objectContaining({ status: "failed", leaseOwner: null }) }),
    ]));
    expect(mocks.writeAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "payroll.recovered" }));
  });

  it("rejects recovery while the worker lease is active, covers: AC-5 and AC-11", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T01:00:00.000Z"));
    const database = stateTransitionDatabase({
      id: "run-id",
      status: "processing",
      processingGeneration: 1,
      updatedAt: new Date("2026-08-26T00:00:00.000Z"),
      lastProgressAt: new Date("2026-08-26T00:20:00.000Z"),
      leaseExpiresAt: new Date("2026-08-26T01:05:00.000Z"),
    });
    mocks.getDb.mockReturnValue(database);
    const formData = new FormData();
    formData.set("runId", "123e4567-e89b-12d3-a456-426614174003");

    await expect((await import("./payroll")).recoverPayrollAction(formData)).rejects.toThrow("not eligible for recovery");
    expect(database.updates).toHaveLength(0);
  });

  it("retries one failed frozen generation and submits the next deterministic generation, covers: AC-8 and AC-11", async () => {
    const database = stateTransitionDatabase({ id: "run-id", status: "failed", processingGeneration: 1 });
    mocks.getDb.mockReturnValue(database);
    mocks.submitPayrollRun.mockResolvedValue({ submitted: true });
    const formData = new FormData();
    formData.set("runId", "123e4567-e89b-12d3-a456-426614174003");

    await (await import("./payroll")).retryPayrollAction(formData);

    expect(database.updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ tableName: "payouts", values: expect.objectContaining({ status: "pending" }) }),
      expect.objectContaining({ tableName: "payslips", values: expect.objectContaining({ status: "pending", immutable: false }) }),
      expect.objectContaining({ tableName: "payroll_runs", values: expect.objectContaining({ status: "queued", processingGeneration: 2, queueStatus: "pending" }) }),
    ]));
    expect(mocks.submitPayrollRun).toHaveBeenCalledWith({
      runId: "123e4567-e89b-12d3-a456-426614174003",
      organizationId,
      generation: 2,
    });
  });
});
