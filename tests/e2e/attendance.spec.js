import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const canCreateFixture = Boolean(databaseUrl && supabaseUrl && anonKey && serviceRoleKey);

async function expectNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function expectNoSeriousAxeFindings(page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(({ impact }) => ["critical", "serious"].includes(impact))).toEqual([]);
}

async function signIn(page, account) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 15_000 }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

test.describe("attendance check ins and clock outs", () => {
  let admin;
  let fixture;
  let sql;

  test.beforeAll(async () => {
    test.skip(!canCreateFixture, "Database and Supabase admin environment are required for the attendance journey");
    sql = postgres(databaseUrl, { max: 1 });
    admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const nonce = crypto.randomUUID();

    const [organization] = await sql`
      insert into organizations (name, slug, timezone, default_currency)
      values (${`Attendance ${nonce}`}, ${`attendance-${nonce}`}, 'Asia/Manila', 'PHP')
      returning id, name
    `;
    const [alternateOrganization] = await sql`
      insert into organizations (name, slug, timezone, default_currency)
      values (${`Other ${nonce}`}, ${`other-${nonce}`}, 'UTC', 'PHP')
      returning id
    `;

    const accounts = {};
    for (const role of ["employee", "manager"]) {
      const email = `attendance-${role}-${nonce}@example.test`;
      const password = `E2e!${nonce}`;
      const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, password });
      if (error) throw error;
      const [profile] = await sql`
        insert into profiles (auth_user_id, email, display_name)
        values (${data.user.id}, ${email}, ${`Attendance ${role}`})
        returning id
      `;
      await sql`
        insert into memberships (organization_id, profile_id, role, status)
        values (${organization.id}, ${profile.id}, ${role}, 'active')
      `;
      accounts[role] = { email, password, profileId: profile.id, userId: data.user.id };
    }

    const [employee] = await sql`
      insert into employees (organization_id, profile_id, employee_number, legal_name, preferred_name, email, hire_date, status)
      values (${organization.id}, ${accounts.employee.profileId}, 'ATT-001', 'Attendance Employee', 'Ari Employee', ${accounts.employee.email}, current_date, 'active')
      returning id
    `;
    const [otherEmployee] = await sql`
      insert into employees (organization_id, employee_number, legal_name, email, hire_date, status)
      values (${organization.id}, 'ATT-002', 'Other Employee', 'other@example.test', current_date, 'active')
      returning id
    `;
    const [alternateEmployee] = await sql`
      insert into employees (organization_id, employee_number, legal_name, email, hire_date, status)
      values (${alternateOrganization.id}, 'ATT-003', 'Outside Employee', 'outside@example.test', current_date, 'active')
      returning id
    `;

    for (let index = 1; index <= 51; index += 1) {
      await sql`
        insert into attendance_intervals (employee_id, clock_in, clock_out, source, status)
        values (
          ${employee.id},
          date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila' + (${index} * interval '1 minute'),
          date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila' + (${index} * interval '1 minute') + interval '30 seconds',
          'employee',
          'completed'
        )
      `;
    }
    const [otherInterval] = await sql`
      insert into attendance_intervals (employee_id, clock_in, clock_out, source, status)
      values (${otherEmployee.id}, now() - interval '20 minutes', now() - interval '10 minutes', 'employee', 'completed')
      returning id
    `;
    const [outsideInterval] = await sql`
      insert into attendance_intervals (employee_id, clock_in, clock_out, source, status)
      values (${alternateEmployee.id}, now() - interval '20 minutes', now() - interval '10 minutes', 'employee', 'completed')
      returning id
    `;
    const [longInterval] = await sql`
      insert into attendance_intervals (employee_id, clock_in, clock_out, source, status)
      values (
        ${employee.id},
        (date_trunc('day', now() at time zone 'Asia/Manila') - interval '1 day') at time zone 'Asia/Manila' + interval '1 hour',
        (date_trunc('day', now() at time zone 'Asia/Manila') - interval '1 day') at time zone 'Asia/Manila' + interval '26 hours',
        'employee',
        'completed'
      )
      returning id, to_char(clock_in at time zone 'Asia/Manila', 'YYYY-MM-DD') as local_date
    `;

    fixture = {
      accounts,
      employeeId: employee.id,
      longDate: longInterval.local_date,
      organizationId: organization.id,
      organizationName: organization.name,
      organizationIds: [organization.id, alternateOrganization.id],
      profileIds: [accounts.employee.profileId, accounts.manager.profileId],
      protectedIntervalIds: [otherInterval.id, outsideInterval.id],
      userIds: [accounts.employee.userId, accounts.manager.userId],
    };
  });

  test.afterAll(async () => {
    if (sql && fixture) {
      await sql`alter table attendance_intervals disable trigger attendance_intervals_immutable`;
      await sql`alter table audit_events disable trigger audit_events_append_only`;
      try {
        await sql`delete from audit_events where organization_id = any(${fixture.organizationIds})`;
        await sql`delete from attendance_intervals where employee_id in (select id from employees where organization_id = any(${fixture.organizationIds}))`;
      } finally {
        await sql`alter table attendance_intervals enable trigger attendance_intervals_immutable`;
        await sql`alter table audit_events enable trigger audit_events_append_only`;
      }
      await sql`delete from employees where organization_id = any(${fixture.organizationIds})`;
      await sql`delete from memberships where profile_id = any(${fixture.profileIds})`;
      await sql`delete from profiles where id = any(${fixture.profileIds})`;
      await sql`delete from organizations where id = any(${fixture.organizationIds})`;
    }
    if (admin && fixture) {
      for (const userId of fixture.userIds) await admin.auth.admin.deleteUser(userId);
    }
    if (sql) await sql.end();
  });

  test("records a trusted interval and lets a manager review a private paginated day, covers: AC-1 through AC-8", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, fixture.accounts.employee);
    await page.goto("/attendance");
    await expect(page.getByRole("heading", { level: 1, name: "Check in with confidence" })).toBeVisible();
    await expect(page.getByText("Attendance is enabled for synthetic internal beta data only.")).toBeVisible();

    await page.getByRole("button", { name: "Check in" }).click();
    await expect(page.getByText("You are checked in.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Clock out" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Clock out" }).click();
    await expect(page.getByText("You are checked out.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Check in" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Check in" }).click();
    await expect(page.getByRole("button", { name: "Clock out" })).toBeVisible({ timeout: 15_000 });

    const auditRows = await sql`
      select action, metadata
      from audit_events
      where organization_id = ${fixture.organizationId}
        and entity_type = 'attendance_interval'
        and metadata->>'employee_id' = ${fixture.employeeId}
      order by created_at desc
      limit 3
    `;
    expect(auditRows.map((row) => row.action).sort()).toEqual(["attendance.checked_in", "attendance.checked_in", "attendance.clocked_out"]);
    expect(JSON.stringify(auditRows)).not.toContain(fixture.accounts.employee.email);

    const employeeClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    await employeeClient.auth.signInWithPassword(fixture.accounts.employee);
    const { data: hiddenRows, error: employeeReadError } = await employeeClient
      .from("attendance_intervals")
      .select("id")
      .in("id", fixture.protectedIntervalIds);
    expect(employeeReadError).toBeNull();
    expect(hiddenRows).toEqual([]);
    await employeeClient.auth.signOut();

    await page.context().clearCookies();
    await signIn(page, fixture.accounts.manager);
    await page.goto("/attendance/review");
    await expect(page.getByRole("heading", { level: 1, name: "Review the workday clearly" })).toBeVisible();
    await expect(page.getByText("Ari Employee").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Next 50 records" })).toBeVisible();

    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ height: 900, width });
      await page.reload();
      await expectNoOverflow(page);
      await expectNoSeriousAxeFindings(page);
    }

    await page.getByLabel("Attendance date").fill(fixture.longDate);
    await page.getByRole("button", { name: "Review date" }).click();
    await expect(page.getByText("Long interval", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("25h 0m").first()).toBeVisible();
  });
});
