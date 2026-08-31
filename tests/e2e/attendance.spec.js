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

async function createOrganization(sql, nonce, label, timezone = "UTC") {
  const [organization] = await sql`
    insert into organizations (name, slug, timezone, default_currency)
    values (${`${label} ${nonce}`}, ${`${label.toLowerCase().replaceAll(" ", "-")}-${nonce}`}, ${timezone}, 'PHP')
    returning id
  `;
  return organization;
}

async function createAttendanceAccount(sql, admin, { nonce, organizationId, role, profileStatus = "active", membershipStatus = "active", employeeStatus = null, linkEmployee = true }) {
  const email = `attendance-boundary-${role}-${nonce}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const password = `Boundary!${nonce}`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, password });
  if (error) throw error;
  const [profile] = await sql`
    insert into profiles (auth_user_id, email, display_name, status)
    values (${data.user.id}, ${email}, ${`Boundary ${role}`}, ${profileStatus})
    returning id
  `;
  await sql`
    insert into memberships (organization_id, profile_id, role, status)
    values (${organizationId}, ${profile.id}, ${role}, ${membershipStatus})
  `;
  let employeeId = null;
  if (employeeStatus) {
    const [employee] = await sql`
      insert into employees (organization_id, profile_id, employee_number, legal_name, preferred_name, email, hire_date, status)
      values (${organizationId}, ${linkEmployee ? profile.id : null}, ${`BOUND-${crypto.randomUUID().slice(0, 8)}`}, ${`Boundary ${role}`}, ${`Boundary ${role}`}, ${email}, current_date, ${employeeStatus})
      returning id
    `;
    employeeId = employee.id;
  }
  return { email, password, profileId: profile.id, userId: data.user.id, employeeId };
}

async function signInSupabaseAccount(account) {
  const client = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword(account);
  if (error) throw error;
  return client;
}

async function cleanupAttendanceBoundary(sql, admin, fixture) {
  if (!sql || !fixture) return;
  await sql.begin(async (transaction) => {
    // Teardown is isolated to this fixture. Bypass application triggers so the
    // last administrator guard cannot make an isolated organization permanent.
    await transaction`set local session_replication_role = replica`;
    await transaction`delete from audit_events where organization_id = any(${fixture.organizationIds})`;
    await transaction`delete from attendance_intervals where employee_id in (select id from employees where organization_id = any(${fixture.organizationIds}))`;
    await transaction`delete from employees where organization_id = any(${fixture.organizationIds})`;
    await transaction`delete from memberships where profile_id = any(${fixture.profileIds})`;
    await transaction`delete from profiles where id = any(${fixture.profileIds})`;
    await transaction`delete from organizations where id = any(${fixture.organizationIds})`;
  });
  if (admin) {
    for (const userId of fixture.userIds) await admin.auth.admin.deleteUser(userId);
  }
}

test.describe("attendance authorization boundary", () => {
  let admin;
  let fixture;
  let sql;

  test.beforeAll(async () => {
    test.skip(!canCreateFixture, "Database and Supabase admin environment are required for the attendance authorization matrix");
    sql = postgres(databaseUrl, { max: 1 });
    admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const nonce = crypto.randomUUID();
    const organization = await createOrganization(sql, nonce, "Boundary A");
    const outsideOrganization = await createOrganization(sql, nonce, "Boundary B");

    const employee = await createAttendanceAccount(sql, admin, { nonce, organizationId: organization.id, role: "employee", employeeStatus: "active" });
    const manager = await createAttendanceAccount(sql, admin, { nonce, organizationId: organization.id, role: "manager" });
    const administrator = await createAttendanceAccount(sql, admin, { nonce, organizationId: organization.id, role: "administrator" });
    const outsideManager = await createAttendanceAccount(sql, admin, { nonce, organizationId: outsideOrganization.id, role: "manager" });
    const inactiveProfile = await createAttendanceAccount(sql, admin, { nonce, organizationId: organization.id, role: "employee", profileStatus: "inactive", employeeStatus: "active" });
    const inactiveMembership = await createAttendanceAccount(sql, admin, { nonce, organizationId: organization.id, role: "employee", membershipStatus: "inactive", employeeStatus: "active" });
    const unlinked = await createAttendanceAccount(sql, admin, { nonce, organizationId: organization.id, role: "employee", employeeStatus: "active", linkEmployee: false });

    const [siblingEmployee] = await sql`
      insert into employees (organization_id, employee_number, legal_name, preferred_name, email, hire_date, status)
      values (${organization.id}, ${`BOUND-SIBLING-${nonce}`}, 'Boundary Sibling', 'Boundary Sibling', ${`sibling-${nonce}@example.test`}, current_date, 'active')
      returning id
    `;
    const [outsideEmployee] = await sql`
      insert into employees (organization_id, employee_number, legal_name, preferred_name, email, hire_date, status)
      values (${outsideOrganization.id}, ${`BOUND-OUTSIDE-${nonce}`}, 'Boundary Outside', 'Boundary Outside', ${`outside-${nonce}@example.test`}, current_date, 'active')
      returning id
    `;
    const [employeeInterval] = await sql`
      insert into attendance_intervals (employee_id, clock_in, clock_out, source, status)
      values (${employee.employeeId}, now() - interval '5 minutes', now() - interval '1 minute', 'employee', 'completed')
      returning id
    `;
    const [siblingInterval] = await sql`
      insert into attendance_intervals (employee_id, clock_in, clock_out, source, status)
      values (${siblingEmployee.id}, now() - interval '15 minutes', now() - interval '10 minutes', 'employee', 'completed')
      returning id
    `;
    const [outsideInterval] = await sql`
      insert into attendance_intervals (employee_id, clock_in, clock_out, source, status)
      values (${outsideEmployee.id}, now() - interval '25 minutes', now() - interval '20 minutes', 'employee', 'completed')
      returning id
    `;
    const [inactiveProfileInterval] = await sql`
      insert into attendance_intervals (employee_id, clock_in, clock_out, source, status)
      values (${inactiveProfile.employeeId}, now() - interval '35 minutes', now() - interval '30 minutes', 'employee', 'completed')
      returning id
    `;
    const [inactiveMembershipInterval] = await sql`
      insert into attendance_intervals (employee_id, clock_in, clock_out, source, status)
      values (${inactiveMembership.employeeId}, now() - interval '45 minutes', now() - interval '40 minutes', 'employee', 'completed')
      returning id
    `;
    const [unlinkedInterval] = await sql`
      insert into attendance_intervals (employee_id, clock_in, clock_out, source, status)
      values (${unlinked.employeeId}, now() - interval '55 minutes', now() - interval '50 minutes', 'employee', 'completed')
      returning id
    `;
    fixture = {
      accounts: { employee, manager, administrator, outsideManager, inactiveProfile, inactiveMembership, unlinked },
      employeeIntervalId: employeeInterval.id,
      siblingIntervalId: siblingInterval.id,
      outsideIntervalId: outsideInterval.id,
      deniedIntervalIds: [inactiveProfileInterval.id, inactiveMembershipInterval.id, unlinkedInterval.id],
      organizationIds: [organization.id, outsideOrganization.id],
      profileIds: [employee, manager, administrator, outsideManager, inactiveProfile, inactiveMembership, unlinked].map(({ profileId }) => profileId),
      userIds: [employee, manager, administrator, outsideManager, inactiveProfile, inactiveMembership, unlinked].map(({ userId }) => userId),
    };
  });

  test.afterAll(async () => {
    await cleanupAttendanceBoundary(sql, admin, fixture);
    if (sql) await sql.end();
  });

  test("enforces employee, reviewer, cross organization, inactive, unlinked, anonymous, and direct write boundaries, covers: AC-5 and AC-7", async () => {
    const employeeClient = await signInSupabaseAccount(fixture.accounts.employee);
    const { data: ownRows, error: ownReadError } = await employeeClient
      .from("attendance_intervals")
      .select("id")
      .in("id", [fixture.employeeIntervalId, fixture.siblingIntervalId, fixture.outsideIntervalId]);
    expect(ownReadError).toBeNull();
    expect(ownRows.map(({ id }) => id)).toEqual([fixture.employeeIntervalId]);

    for (const account of [fixture.accounts.manager, fixture.accounts.administrator]) {
      const client = await signInSupabaseAccount(account);
      const { data: reviewerRows, error } = await client
        .from("attendance_intervals")
        .select("id")
        .in("id", [fixture.employeeIntervalId, fixture.siblingIntervalId, fixture.outsideIntervalId]);
      expect(error).toBeNull();
      expect(reviewerRows.map(({ id }) => id).sort()).toEqual([fixture.employeeIntervalId, fixture.siblingIntervalId].sort());
    }

    const outsideClient = await signInSupabaseAccount(fixture.accounts.outsideManager);
    const { data: outsideRows, error: outsideReadError } = await outsideClient
      .from("attendance_intervals")
      .select("id")
      .in("id", [fixture.employeeIntervalId, fixture.siblingIntervalId, fixture.outsideIntervalId]);
    expect(outsideReadError).toBeNull();
    expect(outsideRows.map(({ id }) => id)).toEqual([fixture.outsideIntervalId]);

    for (const account of [fixture.accounts.inactiveProfile, fixture.accounts.inactiveMembership, fixture.accounts.unlinked]) {
      const client = await signInSupabaseAccount(account);
      const { data: deniedRows, error } = await client.from("attendance_intervals").select("id").in("id", fixture.deniedIntervalIds);
      expect(error).toBeNull();
      expect(deniedRows).toEqual([]);
      const { data: rpcData, error: rpcError } = await client.rpc("attendance_check_in", { target_organization_id: fixture.organizationIds[0] });
      expect(rpcData).toBeNull();
      expect(rpcError).toBeTruthy();
    }

    const anonymous = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: anonymousRows, error: anonymousReadError } = await anonymous.from("attendance_intervals").select("id");
    expect(anonymousReadError).toBeNull();
    expect(anonymousRows).toEqual([]);
    const { data: anonymousRpcData, error: anonymousRpcError } = await anonymous.rpc("attendance_check_in", { target_organization_id: fixture.organizationIds[0] });
    expect(anonymousRpcData).toBeNull();
    expect(anonymousRpcError).toBeTruthy();

    const { error: insertError } = await employeeClient.from("attendance_intervals").insert({
      employee_id: fixture.accounts.employee.employeeId,
      clock_in: new Date().toISOString(),
      source: "employee",
      status: "open",
    });
    expect(insertError).toBeTruthy();
    const { data: updatedRows, error: updateError } = await employeeClient.from("attendance_intervals").update({ source: "system" }).eq("id", fixture.employeeIntervalId).select("id,source");
    expect(updateError || updatedRows?.length === 0).toBeTruthy();
    const { data: deletedRows, error: deleteError } = await employeeClient.from("attendance_intervals").delete().eq("id", fixture.employeeIntervalId).select("id");
    expect(deleteError || deletedRows?.length === 0).toBeTruthy();
    const [remaining] = await sql`select count(*)::int as count from attendance_intervals where id = ${fixture.employeeIntervalId}`;
    expect(remaining.count).toBe(1);
  });
});

test.describe("attendance concurrent transitions", () => {
  let admin;
  let fixture;
  let sql;

  test.beforeAll(async () => {
    test.skip(!canCreateFixture, "Database and Supabase admin environment are required for the attendance concurrency regression");
    sql = postgres(databaseUrl, { max: 1 });
    admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const nonce = crypto.randomUUID();
    const organization = await createOrganization(sql, nonce, "Concurrency");
    const account = await createAttendanceAccount(sql, admin, { nonce, organizationId: organization.id, role: "employee", employeeStatus: "active" });
    fixture = { account, organizationId: organization.id, organizationIds: [organization.id], profileIds: [account.profileId], userIds: [account.userId] };
  });

  test.afterAll(async () => {
    await cleanupAttendanceBoundary(sql, admin, fixture);
    if (sql) await sql.end();
  });

  test("keeps one committed interval and audit event when check in, clock out, and a lost response race, covers: AC-3", async () => {
    const firstClient = await signInSupabaseAccount(fixture.account);
    const secondClient = await signInSupabaseAccount(fixture.account);
    const checkInResults = await Promise.all([
      firstClient.rpc("attendance_check_in", { target_organization_id: fixture.organizationId }),
      secondClient.rpc("attendance_check_in", { target_organization_id: fixture.organizationId }),
    ]);
    expect(checkInResults.filter(({ data }) => Boolean(data)).length).toBe(1);
    expect(checkInResults.filter(({ error }) => error?.message === "ALREADY_CHECKED_IN").length).toBe(1);

    const [openCount] = await sql`
      select count(*)::int as count
      from attendance_intervals interval
      join employees employee on employee.id = interval.employee_id
      where employee.id = ${fixture.account.employeeId} and interval.status = 'open'
    `;
    const [checkInAuditCount] = await sql`
      select count(*)::int as count
      from audit_events
      where organization_id = ${fixture.organizationId} and action = 'attendance.checked_in' and metadata->>'employee_id' = ${fixture.account.employeeId}
    `;
    expect(openCount.count).toBe(1);
    expect(checkInAuditCount.count).toBe(1);

    const clockOutResults = await Promise.all([
      firstClient.rpc("attendance_clock_out", { target_organization_id: fixture.organizationId }),
      secondClient.rpc("attendance_clock_out", { target_organization_id: fixture.organizationId }),
    ]);
    expect(clockOutResults.filter(({ data }) => Boolean(data)).length).toBe(1);
    expect(clockOutResults.filter(({ error }) => error?.message === "NOT_CHECKED_IN").length).toBe(1);
    const [completedCount] = await sql`
      select count(*)::int as count
      from attendance_intervals interval
      join employees employee on employee.id = interval.employee_id
      where employee.id = ${fixture.account.employeeId} and interval.status = 'completed'
    `;
    const [clockOutAuditCount] = await sql`
      select count(*)::int as count
      from audit_events
      where organization_id = ${fixture.organizationId} and action = 'attendance.clocked_out' and metadata->>'employee_id' = ${fixture.account.employeeId}
    `;
    expect(completedCount.count).toBe(1);
    expect(clockOutAuditCount.count).toBe(1);

    const realFetch = globalThis.fetch;
    const responseDroppingClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: async (input, init) => {
          const response = await realFetch(input, init);
          const url = typeof input === "string" ? input : input.url;
          if (url.includes("/rest/v1/rpc/attendance_check_in")) throw new Error("simulated lost response");
          return response;
        },
      },
    });
    await responseDroppingClient.auth.signInWithPassword(fixture.account);
    const { data: droppedData, error: droppedError } = await responseDroppingClient.rpc("attendance_check_in", { target_organization_id: fixture.organizationId });
    expect(droppedData).toBeNull();
    expect(droppedError).toBeTruthy();
    const [reloadedState] = await sql`
      select interval.status
      from attendance_intervals interval
      join employees employee on employee.id = interval.employee_id
      where employee.id = ${fixture.account.employeeId} and interval.status = 'open'
    `;
    expect(reloadedState.status).toBe("open");
    const [reloadedAuditCount] = await sql`
      select count(*)::int as count
      from audit_events
      where organization_id = ${fixture.organizationId} and action = 'attendance.checked_in' and metadata->>'employee_id' = ${fixture.account.employeeId}
    `;
    expect(reloadedAuditCount.count).toBe(2);
    await responseDroppingClient.auth.signOut();
  });
});
