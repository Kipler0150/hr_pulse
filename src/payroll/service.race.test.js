import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

import { approveTimecard, prepareTimecard, submitTimecard } from "@/overtime/service";
import { previewPayroll } from "./service";

const integrationEnabled = process.env.HR_PULSE_OVERTIME_INTEGRATION === "true" && Boolean(process.env.DATABASE_URL);

describe.skipIf(!integrationEnabled)("payroll preview and approval race", () => {
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  let fixture;

  function expectSafePreview(preview, approvedCard = null) {
    const missingApproval = preview.issues.filter((issue) => issue.code === "TIMECARD_APPROVAL_MISSING");
    if (missingApproval.length > 0) {
      expect(missingApproval).toEqual([expect.objectContaining({ employeeId: fixture.employeeId, field: "timecard" })]);
      expect(preview.rows).toHaveLength(0);
      return;
    }

    expect(preview.issues).toHaveLength(0);
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0].timecard).toMatchObject({
      id: fixture.timecardId,
      status: "approved",
      version: approvedCard?.version,
    });
  }

  beforeAll(async () => {
    const nonce = randomUUID();
    const [organization] = await sql`
      insert into organizations (name, slug, timezone, default_currency)
      values (${`Payroll preview race ${nonce}`}, ${`payroll-preview-race-${nonce}`}, 'Asia/Manila', 'PHP')
      returning id, name, timezone, default_currency
    `;
    const profiles = {};
    for (const role of ["employee", "manager", "administrator"]) {
      const [profile] = await sql`
        insert into profiles (auth_user_id, email, display_name)
        values (${randomUUID()}, ${`preview-race-${role}-${nonce}@example.test`}, ${`Preview race ${role}`})
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
      values (${organization.id}, ${profiles.manager.id}, 'RACE-MGR', 'Preview Race Manager', ${`preview-race-manager-${nonce}@example.test`}, '2026-08-24', 'active')
      returning id
    `;
    const [employee] = await sql`
      insert into employees (organization_id, profile_id, manager_id, employee_number, legal_name, email, hire_date, status)
      values (${organization.id}, ${profiles.employee.id}, ${manager.id}, 'RACE-001', 'Preview Race Employee', ${`preview-race-employee-${nonce}@example.test`}, '2026-01-01', 'active')
      returning id
    `;
    const [schedule] = await sql`
      insert into payroll_schedules (organization_id, frequency, anchor_start_date, effective_start_date, version)
      values (${organization.id}, 'weekly', '2026-08-17', '2026-08-17', 1)
      returning id
    `;
    await sql`
      insert into overtime_policies (organization_id, version, effective_from, daily_threshold_minutes, enabled)
      values (${organization.id}, 1, '2026-08-17', 480, true)
    `;
    await sql`
      insert into pay_settings (employee_id, effective_from, pay_frequency, version, gross_amount_minor, currency, overtime_eligible, standard_period_minutes, overtime_multiplier_basis_points)
      values (${employee.id}, '2026-08-17', 'weekly', 1, 100000, 'PHP', true, 2400, 15000)
    `;
    await sql`
      insert into attendance_intervals (employee_id, clock_in, clock_out, source, status)
      values (${employee.id}, '2026-08-18T00:00:00Z', '2026-08-18T10:30:00Z', 'employee', 'completed')
    `;
    const organizationContext = { id: organization.id, name: organization.name, timezone: organization.timezone, defaultCurrency: organization.default_currency };
    fixture = {
      organizationId: organization.id,
      employeeId: employee.id,
      profileIds: Object.values(profiles).map((profile) => profile.id),
      employeeContext: { organizationId: organization.id, organization: organizationContext, profile: profiles.employee, membership: { role: "employee" }, employeeId: employee.id },
      managerContext: { organizationId: organization.id, organization: organizationContext, profile: profiles.manager, membership: { role: "manager" }, employeeId: manager.id },
      administratorProfileId: profiles.administrator.id,
    };
    const prepared = await prepareTimecard({
      context: fixture.employeeContext,
      employeeId: employee.id,
      period: { periodStart: "2026-08-17", periodEnd: "2026-08-23" },
      requestId: randomUUID(),
    });
    const submitted = await submitTimecard({
      context: fixture.employeeContext,
      timecardId: prepared.card.id,
      expectedVersion: prepared.card.version,
      zeroHoursConfirmed: false,
      requestId: randomUUID(),
    });
    fixture.timecardId = submitted.card.id;
    fixture.timecardVersion = submitted.card.version;
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

  it("returns only a blocker or one complete frozen card while approval races preview, covers: AC-6 and AC-8", async () => {
    const beforeApproval = await previewPayroll({ organizationId: fixture.organizationId, actorProfileId: fixture.administratorProfileId, persistToken: false });
    expectSafePreview(beforeApproval);

    const [racedPreview, approval] = await Promise.all([
      previewPayroll({ organizationId: fixture.organizationId, actorProfileId: fixture.administratorProfileId, persistToken: false }),
      approveTimecard({ context: fixture.managerContext, timecardId: fixture.timecardId, expectedVersion: fixture.timecardVersion, fallbackReason: "", requestId: randomUUID() }),
    ]);

    expect(approval.card).toMatchObject({ id: fixture.timecardId, status: "approved" });
    expectSafePreview(racedPreview, approval.card);

    const afterApproval = await previewPayroll({ organizationId: fixture.organizationId, actorProfileId: fixture.administratorProfileId, persistToken: false });
    expectSafePreview(afterApproval, approval.card);
    expect(afterApproval.rows[0].timecard).toMatchObject({
      id: fixture.timecardId,
      status: "approved",
      version: approval.card.version,
      baseGrossAmountMinor: approval.card.baseGrossAmountMinor,
      overtimeAmountMinor: approval.card.overtimeAmountMinor,
    });
  });
});
