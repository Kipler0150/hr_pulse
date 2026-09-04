import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { getTableName } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  recordProductMilestone: vi.fn(),
  writeAuditEvent: vi.fn(),
}));

vi.mock("@/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/product-operations/integration", () => ({ recordProductMilestone: mocks.recordProductMilestone }));
vi.mock("@/lib/audit", () => ({ writeAuditEvent: mocks.writeAuditEvent }));

import { approveTimecard, submitTimecard } from "./service";

const organizationId = "123e4567-e89b-42d3-a456-426614174000";
const employeeId = "223e4567-e89b-42d3-a456-426614174000";
const timecardId = "323e4567-e89b-42d3-a456-426614174000";
const organization = { id: organizationId, name: "Example organization", timezone: "UTC", defaultCurrency: "USD" };
const schedule = { id: "423e4567-e89b-42d3-a456-426614174000", frequency: "weekly", anchorStartDate: "2026-08-17", effectiveStartDate: "2026-08-17" };
const policy = { id: "523e4567-e89b-42d3-a456-426614174000", version: 1, effectiveFrom: "2026-08-01", dailyThresholdMinutes: 480, enabled: true };
const setting = {
  id: "623e4567-e89b-42d3-a456-426614174000",
  employeeId,
  payFrequency: "weekly",
  effectiveFrom: "2026-08-01",
  effectiveTo: null,
  grossAmountMinor: 100000,
  currency: "USD",
  overtimeEligible: false,
  standardPeriodMinutes: 2400,
  overtimeMultiplierBasisPoints: 15000,
};

function createTimecardDatabase({ duplicate = false, cardStatus = "draft", managerId = null } = {}) {
  let policyCall = 0;
  let updatedCard = {
    id: timecardId,
    organizationId,
    employeeId,
    payrollScheduleId: schedule.id,
    periodStart: "2026-08-24",
    periodEnd: "2026-08-30",
    version: 1,
    status: cardStatus,
    overtimePolicyId: policy.id,
    paySettingId: setting.id,
    policyVersion: policy.version,
    dailyThresholdMinutes: policy.dailyThresholdMinutes,
    policyEnabled: policy.enabled,
    overtimeEligible: setting.overtimeEligible,
    standardPeriodMinutes: setting.standardPeriodMinutes,
    overtimeMultiplierBasisPoints: setting.overtimeMultiplierBasisPoints,
    baseGrossAmountMinor: setting.grossAmountMinor,
    currency: setting.currency,
    workedSeconds: 0,
    regularSeconds: 0,
    overtimeSeconds: 0,
    payableOvertimeMinutes: 0,
    overtimeAmountMinor: 0,
  };
  const employee = { id: employeeId, profileId: "723e4567-e89b-42d3-a456-426614174000", managerId };
  const receipt = {
    payloadHash: createHash("sha256").update(JSON.stringify({ expectedVersion: 1, timecardId, zeroHoursConfirmed: true })).digest("hex"),
    resultEntityType: "timecard",
    resultEntityId: timecardId,
  };

  function select(fields = {}) {
    let tableName;
    const chain = {
      from(table) { tableName = getTableName(table); return chain; },
      innerJoin() { return chain; },
      where() { return chain; },
      orderBy() { return chain; },
      limit() { return Promise.resolve(rows()); },
      then(resolve, reject) { return Promise.resolve(rows()).then(resolve, reject); },
    };
    function rows() {
      if (tableName === "mutation_receipts") return duplicate ? [receipt] : [];
      if (tableName === "timecards") return [updatedCard];
      if (tableName === "employees" && fields.employee) return [{ employee: { id: managerId }, profile: { id: "823e4567-e89b-42d3-a456-426614174000" }, membership: { role: "manager" } }];
      if (tableName === "employees") return [employee];
      if (tableName === "payroll_schedules") return [schedule];
      if (tableName === "overtime_policies") {
        policyCall += 1;
        return policyCall === 1 ? [policy] : [];
      }
      if (tableName === "pay_settings") return [setting];
      if (tableName === "memberships") return fields.profileId ? [{ profileId: "923e4567-e89b-42d3-a456-426614174000" }] : [];
      if (tableName === "attendance_intervals") return [];
      if (tableName === "timecard_day_sources") return [];
      return [];
    }
    return chain;
  }

  function insert() {
    return { values: () => ({ returning: () => Promise.resolve([{}]) }) };
  }

  function update() {
    return {
      set(values) {
        return {
          where: () => ({
            returning: async () => {
              updatedCard = { ...updatedCard, ...values, status: values.status ?? updatedCard.status, version: updatedCard.version + 1 };
              return [updatedCard];
            },
          }),
        };
      },
    };
  }

  const transaction = {
    select,
    insert,
    update,
    execute: vi.fn(async (query) => {
      const sql = query.queryChunks?.map((chunk) => chunk.value ?? "").join("") ?? "";
      if (sql.includes("generate_series")) {
        return Array.from({ length: 7 }, (_, index) => ({
          local_date: `2026-08-${String(24 + index).padStart(2, "0")}`,
          utc_start: new Date(Date.UTC(2026, 7, 24 + index)),
          utc_end: new Date(Date.UTC(2026, 7, 25 + index)),
        }));
      }
      return [];
    }),
  };
  return { transaction, transactionDb: { transaction: (callback) => callback(transaction) } };
}

describe("timecard product operation integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records a milestone after a timecard is submitted, covers: AC-4 and AC-5", async () => {
    const database = createTimecardDatabase();
    mocks.getDb.mockReturnValue(database.transactionDb);
    const context = { organizationId, organization, profile: { id: "723e4567-e89b-42d3-a456-426614174000" }, membership: { role: "employee" }, employeeId };

    const result = await submitTimecard({ context, timecardId, expectedVersion: 1, zeroHoursConfirmed: true, requestId: "submit-request" });

    expect(result).toMatchObject({ card: { id: timecardId, status: "submitted", version: 2 }, duplicate: false });
    expect(mocks.recordProductMilestone).toHaveBeenCalledWith({
      organizationId,
      eventName: "timecard.submitted",
      workflowArea: "timecards",
      resultCategory: "success",
      occurrenceIdentity: `${timecardId}:2`,
      analyticsProfileId: context.profile.id,
    });
  });

  it("records a milestone after a timecard is approved, covers: AC-4 and AC-5", async () => {
    const database = createTimecardDatabase({ cardStatus: "submitted" });
    mocks.getDb.mockReturnValue(database.transactionDb);
    const context = { organizationId, organization, profile: { id: "923e4567-e89b-42d3-a456-426614174000" }, membership: { role: "administrator" }, employeeId: null };

    const result = await approveTimecard({ context, timecardId, expectedVersion: 1, fallbackReason: "", requestId: "approve-request" });

    expect(result).toMatchObject({ card: { id: timecardId, status: "approved", version: 2 }, duplicate: false });
    expect(mocks.recordProductMilestone).toHaveBeenCalledWith({
      organizationId,
      eventName: "timecard.approved",
      workflowArea: "timecards",
      resultCategory: "success",
      occurrenceIdentity: `${timecardId}:2`,
      analyticsProfileId: context.profile.id,
    });
  });

  it("does not record a duplicate submission milestone, covers: AC-4 and AC-7", async () => {
    const database = createTimecardDatabase({ duplicate: true });
    mocks.getDb.mockReturnValue(database.transactionDb);
    const context = { organizationId, organization, profile: { id: "723e4567-e89b-42d3-a456-426614174000" }, membership: { role: "employee" }, employeeId };

    await expect(submitTimecard({ context, timecardId, expectedVersion: 1, zeroHoursConfirmed: true, requestId: "submit-request" }))
      .resolves.toMatchObject({ duplicate: true });
    expect(mocks.recordProductMilestone).not.toHaveBeenCalled();
  });
});
