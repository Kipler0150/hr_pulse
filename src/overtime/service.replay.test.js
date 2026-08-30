import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

import {
  approveTimecard,
  correctAttendanceInterval,
  prepareTimecard,
  returnTimecard,
  saveOvertimePolicy,
  submitTimecard,
} from "./service";

const integrationEnabled = process.env.HR_PULSE_OVERTIME_INTEGRATION === "true" && Boolean(process.env.DATABASE_URL);

describe.skipIf(!integrationEnabled)("overtime mutation request replay", () => {
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  let fixture;

  async function operationCounts() {
    return sql`
      select operation, count(*)::int as receipts
      from mutation_receipts
      where organization_id = ${fixture.organizationId}
      group by operation
      order by operation
    `;
  }

  async function eventCount() {
    const [row] = await sql`select count(*)::int as count from timecard_events where organization_id = ${fixture.organizationId}`;
    return row.count;
  }

  async function expectReplay({ first, changed, resultKey }) {
    const firstResult = await first();
    expect(firstResult.duplicate).toBe(false);
    const beforeEvents = await eventCount();
    const beforeReceipts = await operationCounts();

    const duplicate = await first();
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate[resultKey].id).toBe(firstResult[resultKey].id);
    expect(await eventCount()).toBe(beforeEvents);
    expect(await operationCounts()).toEqual(beforeReceipts);

    await expect(changed()).rejects.toMatchObject({ code: "TIMECARD_DUPLICATE_REQUEST" });
    expect(await eventCount()).toBe(beforeEvents);
    expect(await operationCounts()).toEqual(beforeReceipts);
    return firstResult;
  }

  beforeAll(async () => {
    const nonce = randomUUID();
    const [organization] = await sql`
      insert into organizations (name, slug, timezone, default_currency)
      values (${`Overtime replay ${nonce}`}, ${`overtime-verify-replay-${nonce}`}, 'Asia/Manila', 'PHP')
      returning id, name, timezone, default_currency
    `;
    const profiles = {};
    for (const role of ["employee", "manager", "administrator"]) {
      const [profile] = await sql`
        insert into profiles (auth_user_id, email, display_name)
        values (${randomUUID()}, ${`replay-${role}-${nonce}@example.test`}, ${`Replay ${role}`})
        returning id
      `;
      await sql`
        insert into memberships (organization_id, profile_id, role, status)
        values (${organization.id}, ${profile.id}, ${role}, 'active')
      `;
      profiles[role] = profile;
    }
    const [manager] = await sql`
      insert into employees (organization_id, profile_id, employee_number, legal_name, email, hire_date, status)
      values (${organization.id}, ${profiles.manager.id}, 'REPLAY-MGR', 'Replay Manager', ${`replay-manager-${nonce}@example.test`}, '2026-01-01', 'active')
      returning id
    `;
    const [employee] = await sql`
      insert into employees (organization_id, profile_id, manager_id, employee_number, legal_name, email, hire_date, status)
      values (${organization.id}, ${profiles.employee.id}, ${manager.id}, 'REPLAY-001', 'Replay Employee', ${`replay-employee-${nonce}@example.test`}, '2026-01-01', 'active')
      returning id
    `;
    const [schedule] = await sql`
      insert into payroll_schedules (organization_id, frequency, anchor_start_date, effective_start_date, version)
      values (${organization.id}, 'weekly', '2026-08-17', '2026-08-17', 1)
      returning id
    `;
    const [policy] = await sql`
      insert into overtime_policies (organization_id, version, effective_from, daily_threshold_minutes, enabled)
      values (${organization.id}, 1, '2026-08-17', 480, true)
      returning id
    `;
    const [paySetting] = await sql`
      insert into pay_settings (employee_id, effective_from, pay_frequency, version, gross_amount_minor, currency, overtime_eligible, standard_period_minutes, overtime_multiplier_basis_points)
      values (${employee.id}, '2026-08-17', 'weekly', 1, 100000, 'PHP', true, 2400, 15000)
      returning id
    `;
    const [interval] = await sql`
      insert into attendance_intervals (employee_id, clock_in, clock_out, source, status)
      values (${employee.id}, '2026-08-18T00:00:00Z', '2026-08-18T10:30:00Z', 'employee', 'completed')
      returning id
    `;
    const organizationContext = {
      id: organization.id,
      name: organization.name,
      timezone: organization.timezone,
      defaultCurrency: organization.default_currency,
    };
    fixture = {
      organizationId: organization.id,
      employeeId: employee.id,
      managerId: manager.id,
      intervalId: interval.id,
      policyId: policy.id,
      paySettingId: paySetting.id,
      profileIds: Object.values(profiles).map((profile) => profile.id),
      employeeContext: { organizationId: organization.id, organization: organizationContext, profile: profiles.employee, membership: { role: "employee" }, employeeId: employee.id },
      managerContext: { organizationId: organization.id, organization: organizationContext, profile: profiles.manager, membership: { role: "manager" }, employeeId: manager.id },
      administratorContext: { organizationId: organization.id, organization: organizationContext, profile: profiles.administrator, membership: { role: "administrator" }, employeeId: null },
    };
  });

  afterAll(async () => {
    if (!fixture) return;
    const tables = ["audit_events", "attendance_interval_corrections", "attendance_intervals", "timecard_events", "timecard_day_sources", "timecard_days", "timecards", "mutation_receipts", "overtime_policies", "pay_settings", "memberships"];
    for (const table of tables) await sql.unsafe(`alter table ${table} disable trigger user`);
    try {
      await sql`delete from timecard_day_sources where timecard_day_id in (select id from timecard_days where timecard_id in (select id from timecards where organization_id = ${fixture.organizationId}))`;
      await sql`delete from timecard_days where timecard_id in (select id from timecards where organization_id = ${fixture.organizationId})`;
      await sql`delete from timecard_events where organization_id = ${fixture.organizationId}`;
      await sql`delete from timecards where organization_id = ${fixture.organizationId}`;
      await sql`delete from attendance_interval_corrections where organization_id = ${fixture.organizationId}`;
      await sql`delete from attendance_intervals where employee_id in (select id from employees where organization_id = ${fixture.organizationId})`;
      await sql`delete from mutation_receipts where organization_id = ${fixture.organizationId}`;
      await sql`delete from audit_events where organization_id = ${fixture.organizationId}`;
      await sql`delete from pay_setting_deductions where pay_setting_id in (select id from pay_settings where employee_id in (select id from employees where organization_id = ${fixture.organizationId}))`;
      await sql`delete from pay_settings where employee_id in (select id from employees where organization_id = ${fixture.organizationId})`;
      await sql`delete from overtime_policies where organization_id = ${fixture.organizationId}`;
      await sql`delete from employees where organization_id = ${fixture.organizationId}`;
      await sql`delete from payroll_schedules where organization_id = ${fixture.organizationId}`;
      await sql`delete from memberships where organization_id = ${fixture.organizationId}`;
      await sql`delete from profiles where id = any(${fixture.profileIds})`;
      await sql`delete from organizations where id = ${fixture.organizationId}`;
    } finally {
      for (const table of tables) await sql.unsafe(`alter table ${table} enable trigger user`);
      await sql.end();
    }
  });

  it("replays every overtime mutation without duplicate events and rejects changed payloads, covers: AC-6 and AC-7", async () => {
    const policyRequestId = randomUUID();
    await expectReplay({
      resultKey: "policy",
      first: () => saveOvertimePolicy({ context: fixture.administratorContext, dailyThresholdMinutes: 480, enabled: true, effectiveFrom: "2026-08-24", expectedVersion: 1, requestId: policyRequestId }),
      changed: () => saveOvertimePolicy({ context: fixture.administratorContext, dailyThresholdMinutes: 481, enabled: true, effectiveFrom: "2026-08-24", expectedVersion: 1, requestId: policyRequestId }),
    });

    const prepareRequestId = randomUUID();
    const prepared = await expectReplay({
      resultKey: "card",
      first: () => prepareTimecard({ context: fixture.employeeContext, employeeId: fixture.employeeId, period: { periodStart: "2026-08-17", periodEnd: "2026-08-23" }, requestId: prepareRequestId }),
      changed: () => prepareTimecard({ context: fixture.employeeContext, employeeId: fixture.employeeId, period: { periodStart: "2026-08-17", periodEnd: "2026-08-22" }, requestId: prepareRequestId }),
    });

    const submitRequestId = randomUUID();
    const submitted = await expectReplay({
      resultKey: "card",
      first: () => submitTimecard({ context: fixture.employeeContext, timecardId: prepared.card.id, expectedVersion: prepared.card.version, zeroHoursConfirmed: false, requestId: submitRequestId }),
      changed: () => submitTimecard({ context: fixture.employeeContext, timecardId: prepared.card.id, expectedVersion: prepared.card.version, zeroHoursConfirmed: true, requestId: submitRequestId }),
    });

    const returnRequestId = randomUUID();
    const returned = await expectReplay({
      resultKey: "card",
      first: () => returnTimecard({ context: fixture.managerContext, timecardId: submitted.card.id, expectedVersion: submitted.card.version, note: "Please correct the interval.", fallbackReason: "", requestId: returnRequestId }),
      changed: () => returnTimecard({ context: fixture.managerContext, timecardId: submitted.card.id, expectedVersion: submitted.card.version, note: "Use another note.", fallbackReason: "", requestId: returnRequestId }),
    });

    const correctionRequestId = randomUUID();
    await expectReplay({
      resultKey: "correction",
      first: () => correctAttendanceInterval({ context: fixture.administratorContext, intervalId: fixture.intervalId, correctedClockIn: "2026-08-18T00:00:00Z", correctedClockOut: "2026-08-18T11:00:00Z", reason: "Verified supervisor record.", expectedCorrectionId: null, requestId: correctionRequestId }),
      changed: () => correctAttendanceInterval({ context: fixture.administratorContext, intervalId: fixture.intervalId, correctedClockIn: "2026-08-18T00:00:00Z", correctedClockOut: "2026-08-18T11:00:00Z", reason: "Changed correction reason.", expectedCorrectionId: null, requestId: correctionRequestId }),
    });

    const [refreshed] = await sql`select id, version from timecards where id = ${returned.card.id}`;
    const resubmitRequestId = randomUUID();
    const resubmitted = await expectReplay({
      resultKey: "card",
      first: () => submitTimecard({ context: fixture.employeeContext, timecardId: refreshed.id, expectedVersion: refreshed.version, zeroHoursConfirmed: false, requestId: resubmitRequestId }),
      changed: () => submitTimecard({ context: fixture.employeeContext, timecardId: refreshed.id, expectedVersion: refreshed.version, zeroHoursConfirmed: true, requestId: resubmitRequestId }),
    });

    const approveRequestId = randomUUID();
    await expectReplay({
      resultKey: "card",
      first: () => approveTimecard({ context: fixture.managerContext, timecardId: resubmitted.card.id, expectedVersion: resubmitted.card.version, fallbackReason: "", requestId: approveRequestId }),
      changed: () => approveTimecard({ context: fixture.managerContext, timecardId: resubmitted.card.id, expectedVersion: resubmitted.card.version, fallbackReason: "Changed fallback reason.", requestId: approveRequestId }),
    });

    expect(await operationCounts()).toEqual([
      { operation: "attendance_interval.correct", receipts: 1 },
      { operation: "overtime_policy.save", receipts: 1 },
      { operation: "timecard.approve", receipts: 1 },
      { operation: "timecard.prepare", receipts: 1 },
      { operation: "timecard.return", receipts: 1 },
      { operation: "timecard.submit", receipts: 2 },
    ]);
  });
});
