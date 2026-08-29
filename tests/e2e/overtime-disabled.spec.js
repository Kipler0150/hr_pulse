import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const canCreateFixture = Boolean(databaseUrl && supabaseUrl && serviceRoleKey);

async function signIn(page, account) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 20_000 }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

test.describe("overtime and timecards disabled baseline", () => {
  let authAdmin;
  let fixture;
  let sql;

  test.beforeAll(async () => {
    test.setTimeout(60_000);
    test.skip(!canCreateFixture, "Database and Supabase admin environment are required for the disabled overtime journey");
    sql = postgres(databaseUrl, { max: 1 });
    authAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const nonce = crypto.randomUUID();
    const email = `overtime-disabled-admin-${nonce}@example.test`;
    const password = `E2e!${nonce}`;
    const { data, error } = await authAdmin.auth.admin.createUser({ email, email_confirm: true, password });
    if (error) throw error;
    const [organization] = await sql`
      insert into organizations (name, slug, timezone, default_currency)
      values (${`Overtime disabled ${nonce}`}, ${`overtime-verify-disabled-${nonce}`}, 'Asia/Manila', 'PHP')
      returning id
    `;
    const [profile] = await sql`
      insert into profiles (auth_user_id, email, display_name)
      values (${data.user.id}, ${email}, 'Disabled overtime administrator')
      returning id
    `;
    await sql`
      insert into memberships (organization_id, profile_id, role, status)
      values (${organization.id}, ${profile.id}, 'administrator', 'active')
    `;
    const [employee] = await sql`
      insert into employees (organization_id, employee_number, legal_name, email, hire_date, status)
      values (${organization.id}, 'OT-BASE-001', 'Baseline Employee', 'baseline@example.test', '2026-01-01', 'active')
      returning id
    `;
    await sql`
      insert into payroll_schedules (organization_id, frequency, anchor_start_date, effective_start_date, version)
      values (${organization.id}, 'weekly', '2026-08-17', '2026-08-17', 1)
    `;
    await sql`
      insert into pay_settings (employee_id, effective_from, pay_frequency, version, gross_amount_minor, currency, overtime_eligible)
      values (${employee.id}, '2026-08-17', 'weekly', 1, 100000, 'PHP', false)
    `;
    fixture = {
      account: { email, password },
      employeeId: employee.id,
      organizationId: organization.id,
      profileId: profile.id,
      userId: data.user.id,
    };
  });

  test.afterAll(async () => {
    if (sql && fixture) {
      const triggerTables = ["audit_events", "payroll_runs", "payouts", "payslips", "memberships"];
      for (const table of triggerTables) await sql.unsafe(`alter table ${table} disable trigger user`);
      try {
        await sql`delete from payroll_run_attempts where payroll_run_id in (select id from payroll_runs where organization_id = ${fixture.organizationId})`;
        await sql`delete from payout_deduction_lines where payout_id in (select payout.id from payouts payout join payroll_runs run on run.id = payout.payroll_run_id where run.organization_id = ${fixture.organizationId})`;
        await sql`delete from payout_earning_lines where payout_id in (select payout.id from payouts payout join payroll_runs run on run.id = payout.payroll_run_id where run.organization_id = ${fixture.organizationId})`;
        await sql`delete from payslips where payout_id in (select payout.id from payouts payout join payroll_runs run on run.id = payout.payroll_run_id where run.organization_id = ${fixture.organizationId})`;
        await sql`delete from payouts where payroll_run_id in (select id from payroll_runs where organization_id = ${fixture.organizationId})`;
        await sql`delete from payroll_preview_tokens where organization_id = ${fixture.organizationId}`;
        await sql`delete from payroll_runs where organization_id = ${fixture.organizationId}`;
        await sql`delete from audit_events where organization_id = ${fixture.organizationId}`;
        await sql`delete from pay_setting_deductions where pay_setting_id in (select setting.id from pay_settings setting join employees employee on employee.id = setting.employee_id where employee.organization_id = ${fixture.organizationId})`;
        await sql`delete from pay_settings where employee_id = ${fixture.employeeId}`;
        await sql`delete from employees where organization_id = ${fixture.organizationId}`;
        await sql`delete from payroll_schedules where organization_id = ${fixture.organizationId}`;
        await sql`delete from memberships where organization_id = ${fixture.organizationId}`;
        await sql`delete from profiles where id = ${fixture.profileId}`;
        await sql`delete from organizations where id = ${fixture.organizationId}`;
      } finally {
        for (const table of triggerTables) await sql.unsafe(`alter table ${table} enable trigger user`);
      }
    }
    if (authAdmin && fixture) await authAdmin.auth.admin.deleteUser(fixture.userId);
    if (sql) await sql.end();
  });

  test("keeps timecards unavailable and payroll unchanged when the flag is off, covers: AC-12", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, fixture.account);

    await page.goto("/timecards");
    await expect(page.getByRole("heading", { name: /This page couldn.t load/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Review latest closed period" })).toHaveCount(0);

    await page.goto("/timecards/admin");
    await expect(page.getByRole("heading", { name: /This page couldn.t load/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save new policy version" })).toHaveCount(0);

    await page.goto(`/payroll/employees/${fixture.employeeId}`);
    await expect(page.getByRole("checkbox", { name: "Eligible for overtime" })).toHaveCount(0);
    await expect(page.getByLabel("Standard period minutes")).toHaveCount(0);

    await page.goto("/payroll/preview");
    await page.getByRole("button", { name: "Preview next payroll" }).click();
    await expect(page.getByText(/OT-BASE-001/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("₱1,000.00").first()).toBeVisible();
    await page.getByRole("button", { name: "Confirm and queue payroll" }).click();
    await page.waitForURL(/\/payroll\/runs\/[0-9a-f-]+$/, { timeout: 20_000 });
    const runId = page.url().split("/").at(-1);
    const [payout] = await sql`
      select payout.gross_amount_minor::text, payout.deductions_amount_minor::text, payout.net_amount_minor::text,
        count(earning.id)::int as overtime_earning_count
      from payouts payout
      left join payout_earning_lines earning on earning.payout_id = payout.id and earning.earning_type = 'overtime'
      where payout.payroll_run_id = ${runId}
      group by payout.id
    `;
    expect(payout).toEqual({
      gross_amount_minor: "100000",
      deductions_amount_minor: "0",
      net_amount_minor: "100000",
      overtime_earning_count: 0,
    });
  });
});
