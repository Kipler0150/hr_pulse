import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const canCreateFixture = Boolean(databaseUrl && supabaseUrl && anonKey && serviceRoleKey);

async function signIn(page, account) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 20_000 }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

async function expectNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function expectNoSeriousAxeFindings(page) {
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations.filter(({ impact }) => ["critical", "serious"].includes(impact))).toEqual([]);
}

test.describe("overtime and timecards enabled workflow", () => {
  let authAdmin;
  let fixture;
  let sql;

  test.beforeAll(async () => {
    test.setTimeout(60_000);
    test.skip(!canCreateFixture, "Database and Supabase admin environment are required for the overtime journey");
    sql = postgres(databaseUrl, { max: 1 });
    authAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const nonce = crypto.randomUUID();
    const [organization] = await sql`
      insert into organizations (name, slug, timezone, default_currency)
      values (${`Overtime verify ${nonce}`}, ${`overtime-verify-${nonce}`}, 'Asia/Manila', 'PHP')
      returning id
    `;
    const accounts = {};

    for (const role of ["employee", "manager", "administrator"]) {
      const email = `overtime-${role}-${nonce}@example.test`;
      const password = `E2e!${nonce}`;
      const { data, error } = await authAdmin.auth.admin.createUser({ email, email_confirm: true, password });
      if (error) throw error;
      const [profile] = await sql`
        insert into profiles (auth_user_id, email, display_name)
        values (${data.user.id}, ${email}, ${`Overtime ${role}`})
        returning id
      `;
      await sql`
        insert into memberships (organization_id, profile_id, role, status)
        values (${organization.id}, ${profile.id}, ${role}, 'active')
      `;
      accounts[role] = { email, password, profileId: profile.id, userId: data.user.id };
    }

    const [manager] = await sql`
      insert into employees (organization_id, profile_id, employee_number, legal_name, email, hire_date, status)
      values (${organization.id}, ${accounts.manager.profileId}, 'OT-MGR', 'Morgan Manager', ${accounts.manager.email}, '2026-01-01', 'inactive')
      returning id
    `;
    const [employee] = await sql`
      insert into employees (organization_id, profile_id, manager_id, employee_number, legal_name, preferred_name, email, hire_date, status)
      values (${organization.id}, ${accounts.employee.profileId}, ${manager.id}, 'OT-001', 'Emery Employee', 'Emery', ${accounts.employee.email}, '2026-01-01', 'active')
      returning id
    `;
    await sql`
      insert into payroll_schedules (organization_id, frequency, anchor_start_date, effective_start_date, version)
      values (${organization.id}, 'weekly', '2026-08-17', '2026-08-17', 1)
    `;
    const [interval] = await sql`
      insert into attendance_intervals (employee_id, clock_in, clock_out, source, status)
      values (${employee.id}, '2026-08-18T00:00:00Z', '2026-08-18T10:30:00Z', 'employee', 'completed')
      returning id
    `;

    fixture = {
      accounts,
      employeeId: employee.id,
      intervalId: interval.id,
      organizationId: organization.id,
      profileIds: Object.values(accounts).map(({ profileId }) => profileId),
      userIds: Object.values(accounts).map(({ userId }) => userId),
    };
  });

  test.afterAll(async () => {
    if (sql && fixture) {
      const triggerTables = [
        "audit_events",
        "attendance_intervals",
        "attendance_interval_corrections",
        "timecard_events",
        "mutation_receipts",
        "overtime_policies",
        "timecards",
        "timecard_days",
        "timecard_day_sources",
        "payout_earning_lines",
        "payroll_runs",
        "payouts",
        "payslips",
        "memberships",
      ];
      for (const table of triggerTables) await sql.unsafe(`alter table ${table} disable trigger user`);
      try {
        await sql`delete from payroll_run_attempts where payroll_run_id in (select id from payroll_runs where organization_id = ${fixture.organizationId})`;
        await sql`delete from payout_deduction_lines where payout_id in (select payout.id from payouts payout join payroll_runs run on run.id = payout.payroll_run_id where run.organization_id = ${fixture.organizationId})`;
        await sql`delete from payout_earning_lines where payout_id in (select payout.id from payouts payout join payroll_runs run on run.id = payout.payroll_run_id where run.organization_id = ${fixture.organizationId})`;
        await sql`delete from payslips where payout_id in (select payout.id from payouts payout join payroll_runs run on run.id = payout.payroll_run_id where run.organization_id = ${fixture.organizationId})`;
        await sql`delete from payouts where payroll_run_id in (select id from payroll_runs where organization_id = ${fixture.organizationId})`;
        await sql`delete from payroll_preview_tokens where organization_id = ${fixture.organizationId}`;
        await sql`delete from payroll_runs where organization_id = ${fixture.organizationId}`;
        await sql`delete from timecard_day_sources where timecard_day_id in (select day.id from timecard_days day join timecards card on card.id = day.timecard_id where card.organization_id = ${fixture.organizationId})`;
        await sql`delete from timecard_days where timecard_id in (select id from timecards where organization_id = ${fixture.organizationId})`;
        await sql`delete from timecard_events where organization_id = ${fixture.organizationId}`;
        await sql`delete from timecards where organization_id = ${fixture.organizationId}`;
        await sql`delete from attendance_interval_corrections where organization_id = ${fixture.organizationId}`;
        await sql`delete from mutation_receipts where organization_id = ${fixture.organizationId}`;
        await sql`delete from audit_events where organization_id = ${fixture.organizationId}`;
        await sql`delete from attendance_intervals where employee_id in (select id from employees where organization_id = ${fixture.organizationId})`;
        await sql`delete from pay_setting_deductions where pay_setting_id in (select setting.id from pay_settings setting join employees employee on employee.id = setting.employee_id where employee.organization_id = ${fixture.organizationId})`;
        await sql`delete from pay_settings where employee_id in (select id from employees where organization_id = ${fixture.organizationId})`;
        await sql`delete from overtime_policies where organization_id = ${fixture.organizationId}`;
        await sql`delete from employees where organization_id = ${fixture.organizationId}`;
        await sql`delete from payroll_schedules where organization_id = ${fixture.organizationId}`;
        await sql`delete from memberships where organization_id = ${fixture.organizationId}`;
        await sql`delete from profiles where id = any(${fixture.profileIds})`;
        await sql`delete from organizations where id = ${fixture.organizationId}`;
      } finally {
        for (const table of triggerTables) await sql.unsafe(`alter table ${table} enable trigger user`);
      }
    }
    if (authAdmin && fixture) {
      for (const userId of fixture.userIds) await authAdmin.auth.admin.deleteUser(userId);
    }
    if (sql) await sql.end();
  });

  test("prepares, corrects, approves, and pays an overtime timecard, covers: AC-1 through AC-11", async ({ page }) => {
    test.setTimeout(180_000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await signIn(page, fixture.accounts.administrator);
    await page.goto("/timecards/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Set rules and preserve corrections" })).toBeVisible();
    await page.getByLabel("Effective payroll period start").fill("2026-08-17");
    await page.getByRole("button", { name: "Save new policy version" }).click();
    await expect(page.getByText("Overtime policy saved")).toBeVisible();

    await page.goto(`/payroll/employees/${fixture.employeeId}`);
    await page.getByLabel("Effective from").fill("2026-08-17");
    await page.getByLabel(/Gross pay per weekly period/).fill("1000.00");
    await page.getByRole("checkbox", { name: "Eligible for overtime" }).click();
    await page.getByLabel("Standard period minutes").fill("2400");
    await page.getByRole("button", { name: "Add effective pay setting" }).click();
    await expect(page.getByText("Changes saved")).toBeVisible();

    await signIn(page, fixture.accounts.employee);
    await page.goto("/timecards");
    await page.getByRole("button", { name: "Review latest closed period" }).click();
    const preparationOutcome = await Promise.race([
      page.waitForURL(/\/timecards\/[0-9a-f-]+$/, { timeout: 60_000 }).then(() => "navigated"),
      page.locator('[data-slot="alert"][role="alert"]').waitFor({ state: "visible", timeout: 60_000 }).then(() => "alert"),
    ]);
    if (preparationOutcome === "alert") {
      throw new Error(`Timecard preparation returned: ${await page.locator('[data-slot="alert"][role="alert"]').innerText()}`);
    }
    const timecardId = page.url().split("/").at(-1);
    await expect(page.getByText("10h 30m").first()).toBeVisible();
    await expect(page.getByText("2h 30m").first()).toBeVisible();
    const [prepared] = await sql`
      select worked_seconds, regular_seconds, overtime_seconds, payable_overtime_minutes, overtime_amount_minor::text
      from timecards where id = ${timecardId}
    `;
    expect(prepared).toEqual({
      worked_seconds: 37800,
      regular_seconds: 28800,
      overtime_seconds: 9000,
      payable_overtime_minutes: 150,
      overtime_amount_minor: "9375",
    });
    expect(await sql`select count(*)::int as count from timecard_days where timecard_id = ${timecardId}`).toEqual([{ count: 7 }]);

    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.reload();
      await expectNoOverflow(page);
      await expectNoSeriousAxeFindings(page);
    }
    await page.getByRole("button", { name: "Submit timecard" }).click();
    await expect(page.getByText("Timecard submitted")).toBeVisible();

    await signIn(page, fixture.accounts.manager);
    await page.goto("/timecards/review?status=submitted&periodStart=2026-08-17&periodEnd=2026-08-23");
    await expect(page.getByText(/OT-001/)).toBeVisible();
    await page.getByRole("link", { name: "Review" }).click();
    await page.getByLabel("Return note").fill("Please ask payroll to correct the end time.");
    await page.getByRole("button", { name: "Return for changes" }).click();
    await expect(page.getByText("Timecard returned")).toBeVisible();

    await signIn(page, fixture.accounts.employee);
    await page.goto(`/timecards/${timecardId}`);
    await expect(page.getByText("Employee review required")).toBeVisible();
    await expect(page.getByText("Please ask payroll to correct the end time.")).toBeVisible();

    await signIn(page, fixture.accounts.administrator);
    await page.goto("/timecards/admin");
    await page.getByLabel("Completed interval ID").fill(fixture.intervalId);
    await page.getByLabel("Corrected clock in UTC").fill("2026-08-18T00:00:00Z");
    await page.getByLabel("Corrected clock out UTC").fill("2026-08-18T11:00:00Z");
    await page.getByLabel("Correction reason").fill("Verified end time from supervisor record");
    await page.getByRole("button", { name: "Append correction" }).click();
    await expect(page.getByText("Attendance correction appended")).toBeVisible();
    const [corrected] = await sql`
      select interval.clock_out::text as original_clock_out, correction.corrected_clock_out::text,
        card.worked_seconds, card.regular_seconds, card.overtime_seconds,
        card.payable_overtime_minutes, card.overtime_amount_minor::text
      from attendance_intervals interval
      join attendance_interval_corrections correction on correction.attendance_interval_id = interval.id
      join timecards card on card.employee_id = interval.employee_id
      where interval.id = ${fixture.intervalId} and card.id = ${timecardId}
    `;
    expect(corrected.original_clock_out).toContain("10:30:00");
    expect(corrected.corrected_clock_out).toContain("11:00:00");
    expect(corrected).toMatchObject({
      worked_seconds: 39600,
      regular_seconds: 28800,
      overtime_seconds: 10800,
      payable_overtime_minutes: 180,
      overtime_amount_minor: "11250",
    });

    await signIn(page, fixture.accounts.employee);
    await page.goto(`/timecards/${timecardId}`);
    await expect(page.getByText("11h 0m").first()).toBeVisible();
    await page.getByRole("button", { name: "Resubmit timecard" }).click();
    await expect(page.getByText("Timecard submitted")).toBeVisible();

    await signIn(page, fixture.accounts.manager);
    await page.goto(`/timecards/${timecardId}`);
    await page.getByRole("button", { name: "Approve timecard" }).click();
    await expect(page.getByText("Timecard approved")).toBeVisible();
    const [approved] = await sql`select status::text, approved_at is not null as approved from timecards where id = ${timecardId}`;
    expect(approved).toEqual({ status: "approved", approved: true });
    expect((await sql`select action::text from timecard_events where timecard_id = ${timecardId} order by occurred_at, id`).map(({ action }) => action)).toEqual([
      "prepared",
      "submitted",
      "returned",
      "prepared",
      "resubmitted",
      "approved",
    ]);
    await expect(sql`update timecards set worked_seconds = worked_seconds + 1 where id = ${timecardId}`).rejects.toThrow(/immutable/);

    await signIn(page, fixture.accounts.administrator);
    await page.goto("/payroll/preview");
    await page.getByRole("button", { name: "Preview next payroll" }).click();
    await expect(page.getByText(/OT-001/)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("dd:visible", { hasText: "180 min" })).toBeVisible();
    await page.getByRole("button", { name: "Confirm and queue payroll" }).click();
    await page.waitForURL(/\/payroll\/runs\/[0-9a-f-]+$/, { timeout: 20_000 });
    const runId = page.url().split("/").at(-1);
    const [earning] = await sql`
      select earning.earning_type::text, earning.payable_minutes, earning.amount_minor::text,
        payout.gross_amount_minor::text, payout.net_amount_minor::text, payslip.status::text as payslip_status
      from payout_earning_lines earning
      join payouts payout on payout.id = earning.payout_id
      join payslips payslip on payslip.payout_id = payout.id
      where payout.payroll_run_id = ${runId}
    `;
    expect(earning).toEqual({
      earning_type: "overtime",
      payable_minutes: 180,
      amount_minor: "11250",
      gross_amount_minor: "111250",
      net_amount_minor: "111250",
      payslip_status: "pending",
    });

    const employeeClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    await employeeClient.auth.signInWithPassword(fixture.accounts.employee);
    const { data: hiddenRows, error: rlsError } = await employeeClient.from("timecards").select("id, employee_id").neq("employee_id", fixture.employeeId);
    expect(rlsError).toBeNull();
    expect(hiddenRows).toEqual([]);
    await employeeClient.auth.signOut();

    const [audit] = await sql`
      select count(*)::int as count,
        bool_and(metadata::text not like '%2026-08-18T%') as excludes_raw_times,
        bool_and(metadata::text not like '%11250%') as excludes_pay_amount
      from audit_events where organization_id = ${fixture.organizationId}
    `;
    expect(audit.count).toBeGreaterThanOrEqual(8);
    expect(audit.excludes_raw_times).toBe(true);
    expect(audit.excludes_pay_amount).toBe(true);
    expect(pageErrors).toEqual([]);
  });
});
