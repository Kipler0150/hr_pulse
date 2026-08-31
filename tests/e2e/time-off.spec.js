import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { expect, test } from "@playwright/test";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const fixture = {
  organizationId: process.env.TIME_OFF_E2E_ORGANIZATION_ID,
  employee: { email: process.env.TIME_OFF_E2E_EMPLOYEE_EMAIL, password: process.env.TIME_OFF_E2E_PASSWORD },
  manager: { email: process.env.TIME_OFF_E2E_MANAGER_EMAIL, password: process.env.TIME_OFF_E2E_PASSWORD },
  administrator: { email: process.env.TIME_OFF_E2E_ADMIN_EMAIL, password: process.env.TIME_OFF_E2E_PASSWORD },
};
const canRun = Boolean(databaseUrl && supabaseUrl && anonKey && serviceRoleKey && fixture.organizationId && fixture.employee.email && fixture.manager.email && fixture.administrator.email && fixture.employee.password);

async function signIn(page, account, origin = "") {
  await page.goto(`${origin}/sign-in`);
  await page.getByLabel("Work email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await Promise.all([page.waitForURL(/\/dashboard/), page.getByRole("button", { name: "Sign in" }).click()]);
}

async function expectNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function expectNoSeriousAxeFindings(page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(({ impact }) => ["critical", "serious"].includes(impact))).toEqual([]);
}

async function deleteFixtureRequests(sql, ids) {
  if (!ids.length) return;
  await sql.begin(async (transaction) => {
    await transaction.unsafe("alter table leave_request_events disable trigger user");
    await transaction.unsafe("alter table leave_requests disable trigger user");
    await transaction`delete from leave_request_events where leave_request_id = any(${ids})`;
    await transaction`delete from leave_requests where id = any(${ids})`;
    await transaction.unsafe("alter table leave_requests enable trigger user");
    await transaction.unsafe("alter table leave_request_events enable trigger user");
  });
}

async function startShutdownServer() {
  const port = "3101";
  const command = process.execPath;
  const args = ["node_modules/next/dist/bin/next", "start", "-p", port];
  const server = spawn(command, args, { cwd: process.cwd(), env: { ...process.env, HR_PULSE_TIME_OFF_ENABLED: "false", NODE_ENV: "production" }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  server.stdout.on("data", (chunk) => { output += chunk.toString(); });
  server.stderr.on("data", (chunk) => { output += chunk.toString(); });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://localhost:${port}/sign-in`);
      if (response.ok) return { server, output, port };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  server.kill();
  throw new Error(`Production shutdown server did not start: ${output}`);
}

test.describe("time off requests and manager approvals", () => {
  let sql;
  let employeeId;
  let originalManagerId;
  const runTag = crypto.randomUUID();
  const createdReasons = [];
  const dates = { decline: "2032-03-10", replay: "2032-03-12", fallback: "2032-03-14", inactive: "2032-03-16", approveReplay: "2032-03-18", declineReplay: "2032-03-20", cancelReplay: "2032-03-22", terminal: "2032-03-24", crossActorReplay: "2032-03-26" };

  test.beforeAll(async () => {
    test.skip(!canRun, "Local Supabase time off fixture variables are required");
    sql = postgres(databaseUrl, { max: 1 });
    const [employee] = await sql`select id, manager_id from employees where organization_id = ${fixture.organizationId} and email = ${fixture.employee.email}`;
    employeeId = employee?.id;
    originalManagerId = employee?.manager_id;
    if (!employeeId) throw new Error("Time off employee fixture is missing");
    const staleRows = await sql`select id from leave_requests where organization_id = ${fixture.organizationId} and employee_id = ${employeeId} and reason like any(${[
      "browser verification %",
      "Exact replay %",
      "Administrator fallback %",
      "Approve replay %",
      "Decline replay %",
      "Cancel replay %",
      "Inactive identity %",
      "Terminal transition %",
      "Cross actor replay %",
      "Employment bounds %",
      "Cursor row %",
    ]})`;
    const staleIds = staleRows.map(({ id }) => id);
    await deleteFixtureRequests(sql, staleIds);
  });

  test.afterAll(async () => {
    if (!sql || !createdReasons.length) return;
    const rows = await sql`select id from leave_requests where organization_id = ${fixture.organizationId} and reason = any(${createdReasons})`;
    const ids = rows.map(({ id }) => id);
    await deleteFixtureRequests(sql, ids);
    await sql.end();
  });

  test("submits a request, lets its manager decline it, and keeps the note private to detail, covers: AC-1, AC-3, AC-6, and AC-10", async ({ page }) => {
    test.skip(!canRun, "Local Supabase time off fixture variables are required");
    const createdReason = `browser verification ${runTag}`;
    createdReasons.push(createdReason);
    await signIn(page, fixture.employee);
    await page.goto("/time-off");
    await page.getByLabel("Start date").fill(dates.decline);
    await page.getByLabel("End date").fill(dates.decline);
    await page.getByLabel("Reason (optional)").fill(createdReason);
    await page.getByRole("button", { name: "Submit request" }).click();
    await expect(page.getByText("Saved")).toBeVisible();
    const requestLink = page.locator("article").filter({ hasText: createdReason }).getByRole("link", { name: "View request" });
    const requestUrl = await requestLink.getAttribute("href");
    expect(requestUrl).toMatch(/^\/time-off\/[0-9a-f-]+$/);
    await requestLink.click();
    await expect(page.getByText(`Reason: ${createdReason}`, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();

    await signIn(page, fixture.manager);
    await page.goto("/time-off/review");
    await expect(page.getByText("Direct reports")).toBeVisible();
    await expect(page.getByText("Notes stay out of the queue until you open a decision.")).toBeVisible();
    await expect(page.getByText(createdReason)).toHaveCount(0);
    await page.goto(`/time-off/review${requestUrl.slice("/time-off".length)}`);
    await page.getByLabel("Decision note").fill("Not available for this date.");
    await page.getByRole("button", { name: "Decline" }).click();
    await expect(page.getByRole("list").getByText("Declined")).toBeVisible();
    await expect(page.getByText("Not available for this date.")).toBeVisible();
  });

  test("shows approved requests to the administrator and preserves responsive accessible review surfaces, covers: AC-4, AC-6, and AC-11", async ({ page }) => {
    test.skip(!canRun, "Local Supabase time off fixture variables are required");
    await signIn(page, fixture.administrator);
    await page.goto("/time-off/review");
    await expect(page.getByText("Organization", { exact: true })).toBeVisible();
    await page.getByLabel("Status").selectOption("approved");
    await page.getByRole("button", { name: "Apply filter" }).click();
    await expect(page).toHaveURL(/status=approved/);
    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.reload();
      await expectNoOverflow(page);
      await expectNoSeriousAxeFindings(page);
    }
  });

  test("replays an identical submit, rejects changed content, and blocks direct writes, covers: AC-5, AC-8, and AC-9", async () => {
    test.skip(!canRun, "Local Supabase time off fixture variables are required");
    const client = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const auth = await client.auth.signInWithPassword(fixture.employee);
    expect(auth.error).toBeNull();
    const retryRequestId = crypto.randomUUID();
    const replayReason = `Exact replay ${runTag}`;
    createdReasons.push(replayReason);
    const payload = { target_organization_id: fixture.organizationId, start_date: dates.replay, end_date: dates.replay, leave_type: "paid", reason: replayReason, retry_request_id: retryRequestId };
    const first = await client.rpc("submit_leave_request", payload);
    expect(first.error).toBeNull();
    const requestId = first.data.result.requestId;
    const replay = await client.rpc("submit_leave_request", payload);
    expect(replay.error).toBeNull();
    expect(replay.data.result).toEqual(first.data.result);
    expect(replay.data.retryOutcome).toBe("replayed");
    const changed = await client.rpc("submit_leave_request", { ...payload, reason: "Changed content" });
    expect(changed.error?.message).toContain("TIME_OFF_RETRY_CONFLICT");
    const directWrite = await client.from("leave_requests").insert({ organization_id: fixture.organizationId, employee_id: requestId, start_date: "2027-02-13", end_date: "2027-02-13", leave_type: "paid", reason: "direct write", status: "submitted", version: 1 });
    expect(directWrite.error?.message).toContain("row-level security");
    await client.auth.signOut();
  });

  test("lets an administrator approve when no manager exists and requires a fallback reason, covers: AC-4 and AC-9", async () => {
    test.skip(!canRun, "Local Supabase time off fixture variables are required");
    const employeeClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const administratorClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const reason = `Administrator fallback ${runTag}`;
    createdReasons.push(reason);
    try {
      await sql`update employees set manager_id = null where id = ${employeeId}`;
      expect((await employeeClient.auth.signInWithPassword(fixture.employee)).error).toBeNull();
      const submitted = await employeeClient.rpc("submit_leave_request", { target_organization_id: fixture.organizationId, start_date: dates.fallback, end_date: dates.fallback, leave_type: "paid", reason, retry_request_id: crypto.randomUUID() });
      expect(submitted.error).toBeNull();
      const requestId = submitted.data.result.requestId;
      expect((await administratorClient.auth.signInWithPassword(fixture.administrator)).error).toBeNull();
      const approved = await administratorClient.rpc("approve_leave_request", { target_organization_id: fixture.organizationId, target_request_id: requestId, expected_version: 1, fallback_reason: "No active manager is assigned.", retry_request_id: crypto.randomUUID() });
      expect(approved.error).toBeNull();
      expect(approved.data.result.status).toBe("approved");
      expect(approved.data.result.actorRole).toBe("administrator");
    } finally {
      await sql`update employees set manager_id = ${originalManagerId} where id = ${employeeId}`;
      await employeeClient.auth.signOut();
      await administratorClient.auth.signOut();
    }
  });

  test("denies submission from an inactive employee identity, covers: AC-8 and AC-9", async () => {
    test.skip(!canRun, "Local Supabase time off fixture variables are required");
    const client = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    try {
      await sql`update employees set status = 'inactive' where id = ${employeeId}`;
      expect((await client.auth.signInWithPassword(fixture.employee)).error).toBeNull();
      const denied = await client.rpc("submit_leave_request", { target_organization_id: fixture.organizationId, start_date: dates.inactive, end_date: dates.inactive, leave_type: "paid", reason: `Inactive identity ${runTag}`, retry_request_id: crypto.randomUUID() });
      expect(denied.error?.message).toContain("TIME_OFF_FORBIDDEN");
    } finally {
      await sql`update employees set status = 'active' where id = ${employeeId}`;
      await client.auth.signOut();
    }
  });

  test("replays approve, decline, and cancel transitions without duplicate outcomes, covers: AC-3 and AC-5", async () => {
    test.skip(!canRun, "Local Supabase time off fixture variables are required");
    const employeeClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const managerClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const submit = async (date, reason) => {
      createdReasons.push(reason);
      const response = await employeeClient.rpc("submit_leave_request", { target_organization_id: fixture.organizationId, start_date: date, end_date: date, leave_type: "paid", reason, retry_request_id: crypto.randomUUID() });
      expect(response.error).toBeNull();
      return response.data.result.requestId;
    };
    try {
      expect((await employeeClient.auth.signInWithPassword(fixture.employee)).error).toBeNull();
      expect((await managerClient.auth.signInWithPassword(fixture.manager)).error).toBeNull();
      const approvedId = await submit(dates.approveReplay, `Approve replay ${runTag}`);
      const approvedPayload = { target_organization_id: fixture.organizationId, target_request_id: approvedId, expected_version: 1, fallback_reason: null, retry_request_id: crypto.randomUUID() };
      const approved = await managerClient.rpc("approve_leave_request", approvedPayload);
      const approvedReplay = await managerClient.rpc("approve_leave_request", approvedPayload);
      expect(approved.error).toBeNull();
      expect(approvedReplay.error).toBeNull();
      expect(approvedReplay.data.retryOutcome).toBe("replayed");

      const declinedId = await submit(dates.declineReplay, `Decline replay ${runTag}`);
      const declinedPayload = { target_organization_id: fixture.organizationId, target_request_id: declinedId, expected_version: 1, decision_note: "Decline replay note.", fallback_reason: null, retry_request_id: crypto.randomUUID() };
      const declined = await managerClient.rpc("decline_leave_request", declinedPayload);
      const declinedReplay = await managerClient.rpc("decline_leave_request", declinedPayload);
      expect(declined.error).toBeNull();
      expect(declinedReplay.error).toBeNull();
      expect(declinedReplay.data.retryOutcome).toBe("replayed");

      const cancelledId = await submit(dates.cancelReplay, `Cancel replay ${runTag}`);
      const cancelledPayload = { target_organization_id: fixture.organizationId, target_request_id: cancelledId, expected_version: 1, retry_request_id: crypto.randomUUID() };
      const cancelled = await employeeClient.rpc("cancel_leave_request", cancelledPayload);
      const cancelledReplay = await employeeClient.rpc("cancel_leave_request", cancelledPayload);
      expect(cancelled.error).toBeNull();
      expect(cancelledReplay.error).toBeNull();
      expect(cancelledReplay.data.retryOutcome).toBe("replayed");
    } finally {
      await employeeClient.auth.signOut();
      await managerClient.auth.signOut();
    }
  });

  test("rejects the exact 367 day range, employment violations, terminal transitions, and another actor replay, covers: AC-2, AC-3, and AC-5", async () => {
    test.skip(!canRun, "Local Supabase time off fixture variables are required");
    const employeeClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const managerClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    try {
      expect((await employeeClient.auth.signInWithPassword(fixture.employee)).error).toBeNull();
      const tooLong = await employeeClient.rpc("submit_leave_request", { target_organization_id: fixture.organizationId, start_date: "2027-04-01", end_date: "2028-04-02", leave_type: "paid", reason: `367 day range ${runTag}`, retry_request_id: crypto.randomUUID() });
      expect(tooLong.error?.message).toContain("TIME_OFF_INVALID_DATE_RANGE");

      const [employment] = await sql`select hire_date, termination_date from employees where id = ${employeeId}`;
      const reason = `Employment bounds ${runTag}`;
      await sql`update employees set hire_date = '2028-01-01', termination_date = null where id = ${employeeId}`;
      const outside = await employeeClient.rpc("submit_leave_request", { target_organization_id: fixture.organizationId, start_date: "2027-04-03", end_date: "2027-04-03", leave_type: "paid", reason, retry_request_id: crypto.randomUUID() });
      expect(outside.error?.message).toContain("TIME_OFF_OUTSIDE_EMPLOYMENT");
      await sql`update employees set hire_date = ${employment.hire_date}, termination_date = ${employment.termination_date} where id = ${employeeId}`;

      const terminalReason = `Terminal transition ${runTag}`;
      createdReasons.push(terminalReason);
      const submitted = await employeeClient.rpc("submit_leave_request", { target_organization_id: fixture.organizationId, start_date: dates.terminal, end_date: dates.terminal, leave_type: "paid", reason: terminalReason, retry_request_id: crypto.randomUUID() });
      expect(submitted.error).toBeNull();
      const requestId = submitted.data.result.requestId;
      expect((await managerClient.auth.signInWithPassword(fixture.manager)).error).toBeNull();
      const approvePayload = { target_organization_id: fixture.organizationId, target_request_id: requestId, expected_version: 1, fallback_reason: null, retry_request_id: crypto.randomUUID() };
      expect((await managerClient.rpc("approve_leave_request", approvePayload)).error).toBeNull();
      const terminalPayload = { ...approvePayload, expected_version: 2, retry_request_id: crypto.randomUUID() };
      const declineAfterApproval = await managerClient.rpc("decline_leave_request", { ...terminalPayload, decision_note: "Too late." });
      expect(declineAfterApproval.error?.message).toContain("TIME_OFF_INVALID_STATE");
      const cancelAfterApproval = await employeeClient.rpc("cancel_leave_request", { target_organization_id: fixture.organizationId, target_request_id: requestId, expected_version: 2, retry_request_id: crypto.randomUUID() });
      expect(cancelAfterApproval.error?.message).toContain("TIME_OFF_INVALID_STATE");

      const replayReason = `Cross actor replay ${runTag}`;
      createdReasons.push(replayReason);
      const replaySubmit = await employeeClient.rpc("submit_leave_request", { target_organization_id: fixture.organizationId, start_date: dates.crossActorReplay, end_date: dates.crossActorReplay, leave_type: "paid", reason: replayReason, retry_request_id: crypto.randomUUID() });
      expect(replaySubmit.error).toBeNull();
      const replayPayload = { target_organization_id: fixture.organizationId, target_request_id: replaySubmit.data.result.requestId, expected_version: 1, fallback_reason: null, retry_request_id: crypto.randomUUID() };
      expect((await managerClient.rpc("approve_leave_request", replayPayload)).error).toBeNull();
      const administrator = administratorClient();
      expect((await administrator.auth.signInWithPassword(fixture.administrator)).error).toBeNull();
      expect((await administrator.rpc("approve_leave_request", replayPayload)).error?.message).toContain("TIME_OFF_RETRY_CONFLICT");
      await administrator.auth.signOut();
    } finally {
      await employeeClient.auth.signOut();
      await managerClient.auth.signOut();
    }
  });

  test("filters the administrator queue and exposes a stable 50 row cursor, covers: AC-6", async ({ page }) => {
    test.skip(!canRun, "Local Supabase time off fixture variables are required");
    const client = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    try {
      expect((await client.auth.signInWithPassword(fixture.employee)).error).toBeNull();
      for (let index = 0; index < 51; index += 1) {
        const date = new Date(Date.UTC(2029, 0, 1 + index)).toISOString().slice(0, 10);
        const reason = `Cursor row ${index} ${runTag}`;
        createdReasons.push(reason);
        const response = await client.rpc("submit_leave_request", { target_organization_id: fixture.organizationId, start_date: date, end_date: date, leave_type: "paid", reason, retry_request_id: crypto.randomUUID() });
        expect(response.error).toBeNull();
      }
      await signIn(page, fixture.administrator);
      await page.goto(`/time-off/review?status=submitted&startDate=2029-01-01&endDate=2029-12-31&employeeId=${employeeId}`);
      await expect(page).toHaveURL(/status=submitted/);
      await expect(page.getByText("51 requests on this page.")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Next 50 requests" })).toBeVisible();
      const nextHref = await page.getByRole("link", { name: "Next 50 requests" }).getAttribute("href");
      expect(nextHref).toContain("startDate=2029-01-01");
      expect(nextHref).toContain("endDate=2029-12-31");
      expect(nextHref).toContain(`employeeId=${employeeId}`);
      await page.goto(nextHref);
      await expect(page.getByText("1 request on this page.")).toBeVisible();
    } finally {
      await client.auth.signOut();
    }
  });

  test("supports keyboard traversal on employee, manager, and administrator surfaces, covers: AC-11", async ({ page }) => {
    test.skip(!canRun, "Local Supabase time off fixture variables are required");
    for (const account of [fixture.employee, fixture.manager, fixture.administrator]) {
      await signIn(page, account);
      await page.goto(account === fixture.employee ? "/time-off" : "/time-off/review");
      await page.keyboard.press("Tab");
      await expect(page.locator(":focus")).toBeVisible();
      await page.keyboard.press("Tab");
      await expect(page.locator(":focus")).toBeVisible();
      await page.getByRole("button", { name: "Sign out" }).click();
    }
  });

  test("disables time off and attendance routes in production when the feature flag is off, covers: AC-12", async ({ page }) => {
    test.skip(!canRun, "Local Supabase time off fixture variables are required");
    test.setTimeout(60000);
    const shutdown = await startShutdownServer();
    try {
      await signIn(page, fixture.employee, `http://localhost:${shutdown.port}`);
      for (const route of ["/time-off", "/time-off/review"]) {
        const response = await page.goto(`http://localhost:${shutdown.port}${route}`);
        expect(response.status()).toBe(404);
        await expect(page.getByText(/server error/i)).toHaveCount(0);
      }
      const attendanceResponse = await page.goto(`http://localhost:${shutdown.port}/attendance`);
      expect(attendanceResponse.status()).toBe(200);
      await expect(page.getByRole("link", { name: "Time off" })).toHaveCount(0);
    } finally {
      shutdown.server.kill();
    }
  });
});

function administratorClient() {
  return createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
