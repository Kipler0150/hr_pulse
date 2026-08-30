import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const canCreateFixture = Boolean(databaseUrl && supabaseUrl && serviceRoleKey);

async function expectNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function expectNoSeriousAxeFindings(page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(({ impact }) => ["critical", "serious"].includes(impact))).toEqual([]);
}

async function signInToPayrollWorkspace(page, fixture) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(fixture.email);
  await page.getByLabel("Password").fill(fixture.password);
  await Promise.all([
    page.waitForURL(/\/(dashboard|choose-organization|pending-access)/, { timeout: 15_000 }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);

  if (/\/choose-organization/.test(page.url())) {
    const preferredWorkspace = page.getByRole("radio", { name: `${fixture.organizationName} administrator`, exact: true });
    const workspace = (await preferredWorkspace.count()) ? preferredWorkspace : page.getByRole("radio").first();
    await workspace.check();
    await Promise.all([
      page.waitForURL(/\/dashboard/, { timeout: 15_000 }),
      page.getByRole("button", { name: "Continue" }).click(),
    ]);
  }

  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("core payroll completion thread", () => {
  let admin;
  let fixture;
  let sql;

  test.beforeAll(async () => {
    test.skip(!canCreateFixture, "Database and Supabase admin environment are required for the payroll journey");
    sql = postgres(databaseUrl, { max: 1 });
    admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const [organization] = await sql`
      select o.id, o.name, completed_run.id as run_id, generated_payslip.id as payslip_id
      from organizations o
      join lateral (
        select run.id
        from payroll_runs run
        where run.organization_id = o.id and run.status = 'completed'
        order by run.created_at desc
        limit 1
      ) completed_run on true
      join lateral (
        select payslip.id
        from payouts payout
        join payslips payslip on payslip.payout_id = payout.id
        where payout.payroll_run_id = completed_run.id and payslip.status = 'generated'
        limit 1
      ) generated_payslip on true
      where exists (
        select 1 from employees e where e.organization_id = o.id and e.status = 'inactive'
      )
      order by o.created_at desc
      limit 1
    `;
    if (!organization) throw new Error("A payroll browser fixture with a completed run, generated payslip, and inactive employee is required");
    const [alternateOrganization] = await sql`
      select o.id, o.name
      from organizations o
      where o.id <> ${organization.id}
        and o.status = 'active'
        and exists (
          select 1 from memberships membership
          where membership.organization_id = o.id
            and membership.role = 'administrator'
            and membership.status = 'active'
        )
      order by o.created_at
      limit 1
    `;
    if (!alternateOrganization) throw new Error("A second active organization is required for the cross organization payroll journey");

    const nonce = crypto.randomUUID();
    const email = `payroll-e2e-${nonce}@example.test`;
    const password = `E2e!${nonce}`;
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, password });
    if (error) throw error;

    const [profile] = await sql`
      insert into profiles (auth_user_id, email, display_name)
      values (${data.user.id}, ${email}, 'Payroll browser test')
      returning id
    `;
    await sql`
      insert into memberships (organization_id, profile_id, role, status)
      values
        (${organization.id}, ${profile.id}, 'administrator', 'active'),
        (${alternateOrganization.id}, ${profile.id}, 'administrator', 'active')
    `;
    fixture = {
      email,
      password,
      profileId: profile.id,
      userId: data.user.id,
      organizationName: organization.name,
      alternateOrganizationName: alternateOrganization.name,
      runId: organization.run_id,
      payslipId: organization.payslip_id,
    };
  });

  test.afterAll(async () => {
    if (sql && fixture?.profileId) {
      await sql`delete from memberships where profile_id = ${fixture.profileId}`;
      await sql`delete from profiles where id = ${fixture.profileId}`;
    }
    if (admin && fixture?.userId) await admin.auth.admin.deleteUser(fixture.userId);
    if (sql) await sql.end();
  });

  test("keeps the completed payroll trail usable, private, responsive, and accessible, covers: AC-5, AC-7, AC-9, AC-10, and AC-11", async ({ page }) => {
    test.setTimeout(90_000);
    await signInToPayrollWorkspace(page, fixture);

    await page.goto("/payroll");
    await expect(page.getByRole("heading", { level: 1, name: "Complete payroll with a clear trail" })).toBeVisible();
    await expect(page.getByRole("banner").getByText("Synthetic beta payroll")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Setup readiness" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Payroll runs" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Preview next payroll" })).toBeVisible();

    for (const width of [360, 1280]) {
      await page.setViewportSize({ height: 900, width });
      await page.reload();
      await expectNoOverflow(page);
    }
    await expectNoSeriousAxeFindings(page);

    const viewRun = page.getByRole("link", { name: "View run" }).first();
    await expect(viewRun).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/payroll\/runs\/[0-9a-f-]+$/, { timeout: 15_000 }),
      viewRun.click(),
    ]);

    await expect(page.getByText("Completed", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Run totals" })).toBeVisible();
    await expect(page.getByText("Net amount owed", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Payouts and payslips" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download payslip" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Attempt history" })).toBeVisible();

    const runId = page.url().split("/").at(-1);
    const statusResponse = await page.request.get(`/api/payroll-runs/${runId}/status`);
    expect(statusResponse.status()).toBe(200);
    expect(await statusResponse.json()).toMatchObject({ id: runId, status: "completed" });
    await expectNoOverflow(page);
    await expectNoSeriousAxeFindings(page);

    await page.setViewportSize({ height: 900, width: 360 });
    await page.reload();
    await expectNoOverflow(page);

    await page.goto("/choose-organization?returnTo=%2Fdashboard");
    await page.getByRole("radio", { name: `${fixture.alternateOrganizationName} administrator`, exact: true }).check();
    await Promise.all([
      page.waitForURL(/\/dashboard/, { timeout: 15_000 }),
      page.getByRole("button", { name: "Continue" }).click(),
    ]);
    expect((await page.request.get(`/api/payroll-runs/${fixture.runId}/status`)).status()).toBe(404);
    expect((await page.request.get(`/api/payslips/${fixture.payslipId}/download`)).status()).toBe(404);

    await page.goto("/choose-organization?returnTo=%2Fdashboard");
    await page.getByRole("radio", { name: `${fixture.organizationName} administrator`, exact: true }).check();
    await Promise.all([
      page.waitForURL(/\/dashboard/, { timeout: 15_000 }),
      page.getByRole("button", { name: "Continue" }).click(),
    ]);

    await page.goto("/payroll/employees");
    await expect(page.getByRole("heading", { level: 1, name: "People included in payroll" })).toBeVisible();
    const managePay = page.getByRole("link", { name: "Manage pay" }).first();
    await expect(managePay).toBeVisible();
    await managePay.click();

    await expect(page.getByRole("heading", { name: "Employment state" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pay history" })).toBeVisible();
    await expect(page.getByText("Confirmed payroll history and payslips remain available.")).toBeVisible();
    await expect(page.getByText("Inactive employee", { exact: true })).toBeVisible();

    await page.setViewportSize({ height: 900, width: 360 });
    await page.reload();
    await expectNoOverflow(page);
    await expectNoSeriousAxeFindings(page);
  });
});
