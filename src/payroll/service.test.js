import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), recordProductMilestone: vi.fn(), writeAuditEvent: vi.fn() }));
vi.mock("@/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/product-operations/integration", () => ({ recordProductMilestone: mocks.recordProductMilestone }));
vi.mock("@/lib/audit", () => ({ writeAuditEvent: mocks.writeAuditEvent }));

import { decodeCursor, PAYROLL_PAGE_SIZE } from "./pagination";
import { confirmPayroll, getPayrollRunStatus, listPayrollRuns, previewPayroll } from "./service";

function queryReturning(rows) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(rows),
    then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
  };
  return chain;
}

function previewDatabase({ previewToken = null } = {}) {
  let currentPreviewToken = previewToken;
  const timestamp = new Date("2026-08-26T00:00:00.000Z");
  const organization = { id: "organization-id", name: "Example organization", timezone: "UTC", defaultCurrency: "USD", status: "active", updatedAt: timestamp };
  const schedule = { id: "schedule-id", frequency: "weekly", anchorStartDate: "2026-08-17", effectiveStartDate: "2026-08-17", version: 1, updatedAt: timestamp };
  const employee = { id: "employee-id", employeeNumber: "E-001", legalName: "Example employee", hireDate: "2026-01-01", status: "active", updatedAt: timestamp };
  const setting = {
    id: "setting-id",
    employeeId: employee.id,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    payFrequency: "weekly",
    version: 1,
    grossAmountMinor: 100000,
    currency: "USD",
    overtimeEligible: false,
    standardPeriodMinutes: 2400,
    overtimeMultiplierBasisPoints: 15000,
    updatedAt: timestamp,
  };
  const run = {
    id: "confirmed-run",
    organizationId: organization.id,
    periodStart: "2026-08-24",
    periodEnd: "2026-08-30",
    confirmedByProfileId: "actor-id",
    status: "queued",
  };

  function select(fields = {}) {
    let tableName;
    const chain = {
      from(table) { tableName = getTableName(table); return chain; },
      innerJoin() { return chain; },
      leftJoin() { return chain; },
      where() { return chain; },
      orderBy() { return chain; },
      limit() { return Promise.resolve(rows()); },
      then(resolve, reject) { return Promise.resolve(rows()).then(resolve, reject); },
    };
    function rows() {
      if (tableName === "organizations") return [{ organization, schedule }];
      if (tableName === "payroll_runs") return [];
      if (tableName === "payroll_preview_tokens") return currentPreviewToken ? [currentPreviewToken] : [];
      if (tableName === "employees") return [employee];
      if (tableName === "pay_settings") return [setting];
      if (tableName === "pay_setting_deductions") return [];
      return [];
    }
    return chain;
  }

  function insert(table) {
    const tableName = getTableName(table);
    return {
      values() {
        if (tableName === "payroll_runs") return { returning: () => Promise.resolve([run]) };
        if (tableName === "payouts") return { returning: () => Promise.resolve([{ id: "payout-id" }]) };
        return Promise.resolve();
      },
    };
  }

  function update() {
    return { set: () => ({ where: () => Promise.resolve([]) }) };
  }

  const transaction = {
    select,
    insert,
    update,
    execute: vi.fn().mockResolvedValue([]),
  };
  const database = {
    select,
    insert,
    update,
    transaction: (callback) => callback(transaction),
    set previewToken(value) { currentPreviewToken = value; },
  };
  return database;
}

describe("payroll read service", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("records a consent controlled milestone after creating a payroll preview, covers: AC-4 and AC-5", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T00:00:00.000Z"));
    vi.stubEnv("SUPABASE_PAYSLIPS_BUCKET", "private-payslips");
    const database = previewDatabase();
    mocks.getDb.mockReturnValue(database);

    const result = await previewPayroll({ organizationId: "organization-id", actorProfileId: "actor-id" });

    expect(result.token).toBeTruthy();
    expect(mocks.recordProductMilestone).toHaveBeenCalledWith({
      organizationId: "organization-id",
      eventName: "payroll.preview_created",
      workflowArea: "payroll",
      resultCategory: "success",
      durationMs: expect.any(Number),
      occurrenceIdentity: `${result.fingerprint}:${result.period.periodEnd}`,
      analyticsProfileId: "actor-id",
    });
  });

  it("records a consent controlled milestone after confirming a payroll preview, covers: AC-4 and AC-5", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T00:00:00.000Z"));
    vi.stubEnv("SUPABASE_PAYSLIPS_BUCKET", "private-payslips");
    const database = previewDatabase();
    const preview = await previewPayroll({ organizationId: "organization-id", actorProfileId: "actor-id", persistToken: false, database });
    database.previewToken = {
      actorProfileId: "actor-id",
      consumedAt: null,
      expiresAt: new Date("2026-09-04T00:30:00.000Z"),
      periodStart: preview.period.periodStart,
      periodEnd: preview.period.periodEnd,
      fingerprint: preview.fingerprint,
      calculationVersion: "fixed-pay-v1",
    };
    mocks.getDb.mockReturnValue(database);

    const result = await confirmPayroll({ organizationId: "organization-id", actorProfileId: "actor-id", token: "preview-token" });

    expect(result).toMatchObject({ run: { id: "confirmed-run" }, duplicate: false });
    expect(mocks.recordProductMilestone).toHaveBeenCalledWith({
      organizationId: "organization-id",
      eventName: "payroll.confirmed",
      workflowArea: "payroll",
      resultCategory: "success",
      durationMs: expect.any(Number),
      occurrenceIdentity: "confirmed-run:confirmed",
      analyticsProfileId: "actor-id",
    });
  });

  it("returns a narrow completed run state and attempt count, covers: AC-5, AC-9, and AC-10", async () => {
    const run = { id: "run-id", status: "completed", updatedAt: new Date("2026-08-26T00:00:00.000Z"), leaseExpiresAt: null };
    const select = vi.fn()
      .mockReturnValueOnce(queryReturning([run]))
      .mockReturnValueOnce(queryReturning([{ count: 3 }]));
    mocks.getDb.mockReturnValue({ select });

    await expect(getPayrollRunStatus("organization-id", "run-id")).resolves.toEqual({
      run,
      attemptCount: 3,
      delayed: false,
      recoveryEligible: false,
    });
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("derives delay and recovery only after progress and lease expiry, covers: AC-5 and AC-11", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T01:00:00.000Z"));
    const run = {
      id: "run-id",
      status: "processing",
      updatedAt: new Date("2026-08-26T00:00:00.000Z"),
      lastProgressAt: new Date("2026-08-26T00:20:00.000Z"),
      leaseExpiresAt: new Date("2026-08-26T00:30:00.000Z"),
    };
    mocks.getDb.mockReturnValue({ select: vi.fn()
      .mockReturnValueOnce(queryReturning([run]))
      .mockReturnValueOnce(queryReturning([{ count: 1 }])) });

    const result = await getPayrollRunStatus("organization-id", "run-id");

    expect(result).toMatchObject({ delayed: true, recoveryEligible: true, attemptCount: 1 });
  });

  it("does not expose another organization run as present, covers: AC-9", async () => {
    mocks.getDb.mockReturnValue({ select: vi.fn()
      .mockReturnValueOnce(queryReturning([]))
      .mockReturnValueOnce(queryReturning([{ count: 0 }])) });

    await expect(getPayrollRunStatus("other-organization", "run-id")).rejects.toThrow("Payroll run not found");
  });

  it("returns fifty stable rows and an opaque compound next cursor, covers: AC-10", async () => {
    const rows = Array.from({ length: PAYROLL_PAGE_SIZE + 1 }, (_, index) => ({
      id: `run-${String(index).padStart(3, "0")}`,
      createdAt: new Date(Date.UTC(2026, 7, 26, 0, 0, PAYROLL_PAGE_SIZE - index)),
    }));
    mocks.getDb.mockReturnValue({ select: vi.fn(() => queryReturning(rows)) });

    const result = await listPayrollRuns("organization-id", null);

    expect(result.rows).toHaveLength(PAYROLL_PAGE_SIZE);
    expect(result.rows.at(-1).id).toBe("run-049");
    expect(decodeCursor(result.nextCursor, ["createdAtMilliseconds", "id"])).toEqual({
      createdAtMilliseconds: String(rows[49].createdAt.getTime()),
      id: "run-049",
    });
  });

  it("returns no next cursor at the final page, covers: AC-10", async () => {
    const rows = [{ id: "run-id", createdAt: new Date("2026-08-26T00:00:00.000Z") }];
    mocks.getDb.mockReturnValue({ select: vi.fn(() => queryReturning(rows)) });

    await expect(listPayrollRuns("organization-id", null)).resolves.toEqual({ rows, nextCursor: null });
  });

  it("returns the existing period run when a duplicate token has expired", async () => {
    vi.stubEnv("SUPABASE_PAYSLIPS_BUCKET", "private-payslips");
    const existingRun = { id: "confirmed-run", status: "queued" };
    const expiredToken = {
      actorProfileId: "actor-id",
      consumedAt: null,
      expiresAt: new Date("2026-08-25T00:00:00.000Z"),
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    };
    const transaction = {
      select: vi.fn()
        .mockReturnValueOnce(queryReturning([]))
        .mockReturnValueOnce(queryReturning([expiredToken]))
        .mockReturnValueOnce(queryReturning([existingRun])),
      execute: vi.fn().mockResolvedValue([]),
    };
    mocks.getDb.mockReturnValue({ transaction: (callback) => callback(transaction) });

    await expect(confirmPayroll({ organizationId: "organization-id", actorProfileId: "actor-id", token: "expired-token" }))
      .resolves.toEqual({ run: existingRun, duplicate: true });
    expect(transaction.select).toHaveBeenCalledTimes(3);
  });
});
