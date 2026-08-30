import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

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

import { confirmPayrollAction, deactivateEmployeeAction, savePaySettingAction } from "./payroll";

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

function paySettingValidationDatabase({ organization, schedule }) {
  return {
    select: vi.fn()
      .mockImplementationOnce(() => ({ from: () => ({ where: () => Promise.resolve([organization]) }) }))
      .mockImplementationOnce(() => ({ from: () => ({ where: () => Promise.resolve([schedule]) }) })),
    transaction: vi.fn(),
  };
}

function paySettingForm(overrides = {}) {
  const formData = new FormData();
  formData.set("employeeId", employeeId);
  formData.set("requestId", "123e4567-e89b-12d3-a456-426614174003");
  formData.set("expectedVersion", "0");
  formData.set("payFrequency", "monthly");
  formData.set("effectiveFrom", "2026-08-01");
  formData.set("grossAmount", "1000.00");
  for (const [key, value] of Object.entries(overrides)) formData.set(key, value);
  return formData;
}

describe("payroll server actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
    mocks.requirePayrollAdministrator.mockResolvedValue({ organizationId, profile: { id: profileId } });
  });

  it.skipIf(process.env.HR_PULSE_OVERTIME_INTEGRATION !== "true" || !process.env.DATABASE_URL)("replays one pay setting request without another setting or receipt, covers: AC-6", async () => {
    const sql = postgres(process.env.DATABASE_URL, { max: 1 });
    const nonce = randomUUID();
    let organizationId;
    let profileId;
    let employeeId;
    try {
      const [organization] = await sql`
        insert into organizations (name, slug, timezone, default_currency)
        values (${`Pay replay ${nonce}`}, ${`overtime-verify-pay-replay-${nonce}`}, 'Asia/Manila', 'PHP')
        returning id
      `;
      organizationId = organization.id;
      const [profile] = await sql`
        insert into profiles (auth_user_id, email, display_name)
        values (${randomUUID()}, ${`pay-replay-${nonce}@example.test`}, 'Pay Replay Administrator')
        returning id
      `;
      profileId = profile.id;
      await sql`insert into memberships (organization_id, profile_id, role, status) values (${organizationId}, ${profileId}, 'administrator', 'active')`;
      const [employee] = await sql`
        insert into employees (organization_id, employee_number, legal_name, email, hire_date, status)
        values (${organizationId}, 'PAY-REPLAY-001', 'Pay Replay Employee', ${`pay-replay-employee-${nonce}@example.test`}, '2026-01-01', 'active')
        returning id
      `;
      employeeId = employee.id;
      await sql`
        insert into payroll_schedules (organization_id, frequency, anchor_start_date, effective_start_date, version)
        values (${organizationId}, 'weekly', '2026-08-17', '2026-08-17', 1)
      `;

      mocks.getDb.mockReturnValue(drizzle(sql));
      mocks.requirePayrollAdministrator.mockResolvedValue({ organizationId, profile: { id: profileId } });
      const requestId = randomUUID();
      const createForm = (grossAmount) => {
        const formData = new FormData();
        formData.set("employeeId", employeeId);
        formData.set("requestId", requestId);
        formData.set("expectedVersion", "0");
        formData.set("payFrequency", "weekly");
        formData.set("effectiveFrom", "2026-08-17");
        formData.set("grossAmount", grossAmount);
        formData.set("overtimeEligible", "on");
        formData.set("standardPeriodMinutes", "2400");
        formData.set("overtimeMultiplierBasisPoints", "15000");
        return formData;
      };

      const first = await savePaySettingAction(null, createForm("1000.00"));
      expect(first).toMatchObject({ success: true });
      const duplicate = await savePaySettingAction(null, createForm("1000.00"));
      expect(duplicate).toEqual(first);
      const [stableCounts] = await sql`
        select
          (select count(*)::int from pay_settings where employee_id = ${employeeId}) as settings,
          (select count(*)::int from mutation_receipts where organization_id = ${organizationId} and operation = 'pay_setting.save') as receipts
      `;
      expect(stableCounts).toEqual({ settings: 1, receipts: 1 });

      const changed = await savePaySettingAction(null, createForm("1000.01"));
      expect(changed).toMatchObject({
        error: {
          code: "REQUEST_FAILED",
          message: "This request identifier was already used for different pay setting data",
        },
      });
      const [rejectedCounts] = await sql`
        select
          (select count(*)::int from pay_settings where employee_id = ${employeeId}) as settings,
          (select count(*)::int from mutation_receipts where organization_id = ${organizationId} and operation = 'pay_setting.save') as receipts
      `;
      expect(rejectedCounts).toEqual(stableCounts);
    } finally {
      if (organizationId) {
        for (const table of ["mutation_receipts", "audit_events", "pay_settings", "memberships"]) await sql.unsafe(`alter table ${table} disable trigger user`);
        try {
          await sql`delete from mutation_receipts where organization_id = ${organizationId}`;
          await sql`delete from audit_events where organization_id = ${organizationId}`;
          await sql`delete from pay_setting_deductions where pay_setting_id in (select id from pay_settings where employee_id = ${employeeId})`;
          await sql`delete from pay_settings where employee_id = ${employeeId}`;
          await sql`delete from employees where organization_id = ${organizationId}`;
          await sql`delete from payroll_schedules where organization_id = ${organizationId}`;
          await sql`delete from memberships where organization_id = ${organizationId}`;
          await sql`delete from profiles where id = ${profileId}`;
          await sql`delete from organizations where id = ${organizationId}`;
        } finally {
          for (const table of ["mutation_receipts", "audit_events", "pay_settings", "memberships"]) await sql.unsafe(`alter table ${table} enable trigger user`);
        }
      }
      await sql.end();
    }
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

  it("rejects a pay setting whose submitted frequency differs from the organization schedule", async () => {
    const database = paySettingValidationDatabase({
      organization: { id: organizationId, defaultCurrency: "USD", timezone: "UTC" },
      schedule: { frequency: "monthly" },
    });
    mocks.getDb.mockReturnValue(database);

    const result = await savePaySettingAction(null, paySettingForm({ payFrequency: "weekly" }));

    expect(result).toMatchObject({ error: { code: "REQUEST_FAILED", message: "Pay frequency must match the payroll schedule" } });
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it("rejects a pay setting that starts away from a payroll period boundary", async () => {
    const database = paySettingValidationDatabase({
      organization: { id: organizationId, defaultCurrency: "USD", timezone: "UTC" },
      schedule: { frequency: "monthly" },
    });
    mocks.getDb.mockReturnValue(database);

    const result = await savePaySettingAction(null, paySettingForm({ effectiveFrom: "2026-08-02" }));

    expect(result).toMatchObject({ error: { code: "REQUEST_FAILED", message: "Pay settings must start and end on payroll period boundaries" } });
    expect(database.transaction).not.toHaveBeenCalled();
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
