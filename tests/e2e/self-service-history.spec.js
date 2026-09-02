import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import postgres from "postgres";

const email = process.env.SELF_SERVICE_E2E_EMAIL || "self-service-employee@example.test";
const password = process.env.SELF_SERVICE_E2E_PASSWORD || "SelfService!2026";
const sql = process.env.DATABASE_URL ? postgres(process.env.DATABASE_URL, { max: 1 }) : null;

function fixtureUuid(label) {
  const chars = createHash("sha256").update(`hr-pulse-self-service:${label}`).digest("hex").slice(0, 32).split("");
  chars[12] = "4";
  chars[16] = ["8", "9", "a", "b"][Number.parseInt(chars[16], 16) % 4];
  const value = chars.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

const employeeId = fixtureUuid("employee");
const organizationId = fixtureUuid("organization");
const organizationName = "HR Pulse Self Service Verification";

async function signIn(page) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function signInAs(page, emailAddress) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(emailAddress);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL(/\/(dashboard|choose-organization|pending-access)/),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
  if (/\/choose-organization/.test(page.url())) {
    const workspace = page.getByRole("radio", { name: new RegExp(organizationName) }).first();
    await workspace.check();
    await Promise.all([
      page.waitForURL(/\/dashboard$/),
      page.getByRole("button", { name: "Continue" }).click(),
    ]);
  }
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.beforeEach(async ({ page }) => {
  test.skip(!process.env.SELF_SERVICE_E2E_ENABLED || !sql, "Local self service fixtures are required.");
  await sql`update profiles set status = 'active' where email = ${email}`;
  await sql`update memberships set status = 'active', deactivated_at = null where organization_id = ${organizationId} and profile_id = (select id from profiles where email = ${email})`;
  await sql`update employees set status = 'active' where id = ${employeeId}`;
  await signIn(page);
});

test("traverses every approved timecard page and preserves detail evidence, covers: AC-5 and AC-9", async ({ page }) => {
  const [count] = await sql`select count(*)::int as count from timecards where employee_id = ${employeeId} and status = 'approved'`;
  const [excluded] = await sql`select id from timecards where employee_id = ${employeeId} and status <> 'approved' limit 1`;
  const [foreign] = await sql`select id from timecards where organization_id <> (select organization_id from employees where id = ${employeeId}) limit 1`;
  await page.goto("/self-service/time");
  const ids = [];
  const bodies = [];
  for (;;) {
    await expect(page.getByRole("heading", { name: "Your finalized time evidence" })).toBeVisible();
    bodies.push(await page.locator("body").innerText());
    ids.push(...await page.getByRole("link", { name: "View evidence" }).evaluateAll((links) => links.map((link) => link.getAttribute("href").split("/").pop())));
    const next = page.getByRole("link", { name: "Older timecards" });
    if (await next.count() === 0) break;
    await page.goto(await next.getAttribute("href"));
  }
  expect(ids).toHaveLength(count.count);
  expect(new Set(ids).size).toBe(ids.length);
  if (excluded) expect(bodies.join("\n")).not.toContain(excluded.id);
  if (foreign) expect(bodies.join("\n")).not.toContain(foreign.id);
  await page.goto(`/self-service/time/${ids[0]}`);
  await expect(page.getByRole("heading", { name: "Attendance source snapshots" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Policy and pay evidence" })).toBeVisible();
  await expect(page.getByText("Clock in")).toBeVisible();
  await expect(page.getByText("Asia/Manila")).toBeVisible();
  await expect(page.getByRole("button", { name: /submit|approve|edit/i })).toHaveCount(0);
});

test("shows the exact stored timecard totals and policy evidence without mutation controls, covers: AC-5", async ({ page }) => {
  await page.goto("/self-service/time");
  const detailHref = await page.getByRole("link", { name: "View evidence" }).first().getAttribute("href");
  await page.goto(new URL(detailHref, page.url()).toString());
  await expect(page.getByRole("heading", { name: "Policy and pay evidence" })).toBeVisible();
  const body = await page.locator("body").innerText();

  for (const value of ["8.00 h", "0.00 h", "0 min", "480 min", "Yes", "PHP", "0 minor units", "28800 sec"]) {
    expect(body).toContain(value);
  }
  await expect(page.getByRole("button", { name: /submit|approve|edit/i })).toHaveCount(0);
});

test("traverses every generated payslip page and preserves masked detail, covers: AC-6 and AC-7", async ({ page }) => {
  const [count] = await sql`select count(*)::int as count from payslips p join payouts po on po.id = p.payout_id join payroll_runs r on r.id = po.payroll_run_id where po.employee_id = ${employeeId} and p.status = 'generated' and p.immutable = true and po.status = 'finalized' and r.status = 'completed'`;
  const [excluded] = await sql`select p.id from payslips p join payouts po on po.id = p.payout_id join payroll_runs r on r.id = po.payroll_run_id where po.employee_id = ${employeeId} and (p.status <> 'generated' or p.immutable <> true or po.status <> 'finalized' or r.status <> 'completed') limit 1`;
  const [foreign] = await sql`select p.id from payslips p join payouts po on po.id = p.payout_id where po.employee_id <> ${employeeId} limit 1`;
  await page.goto("/self-service/payslips");
  const ids = [];
  const bodies = [];
  for (;;) {
    await expect(page.getByRole("heading", { name: "Your finalized pay documents" })).toBeVisible();
    bodies.push(await page.locator("body").innerText());
    ids.push(...await page.getByRole("link", { name: "View payslip" }).evaluateAll((links) => links.map((link) => link.getAttribute("href").split("/").pop())));
    const next = page.getByRole("link", { name: "Older payslips" });
    if (await next.count() === 0) break;
    await page.goto(await next.getAttribute("href"));
  }
  expect(ids).toHaveLength(count.count);
  expect(new Set(ids).size).toBe(ids.length);
  expect(bodies.join("\n")).not.toContain(excluded.id);
  expect(bodies.join("\n")).not.toContain(foreign.id);
  await page.goto(`/self-service/payslips/${ids[0]}`);
  await expect(page.getByRole("heading", { name: "Payroll identity" })).toBeVisible();
  await expect(page.getByText("Generated and immutable")).toBeVisible();
  await expect(page.getByText("Sensitive value hidden").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Reveal sensitive value" }).first()).toBeVisible();
});

test("shows exact payslip identity and amounts only after reveal, then resets masking after reload, covers: AC-6 and AC-7", async ({ page }) => {
  await page.goto("/self-service/payslips");
  const detailHref = await page.getByRole("link", { name: "View payslip" }).first().getAttribute("href");
  await page.goto(new URL(detailHref, page.url()).toString());
  await expect(page.getByRole("heading", { name: "Payroll identity" })).toBeVisible();
  const maskedBody = await page.locator("body").innerText();
  for (const value of ["HR Pulse Self Service Verification", "Synthetic Self Service Employee", "SELF-0001", "SELF-1", "Finalized and generated", "Sensitive value hidden"]) {
    expect(maskedBody).toContain(value);
  }
  expect(maskedBody).not.toContain("₱1,000.00");

  const revealButtons = page.getByRole("button", { name: "Reveal sensitive value" });
  while (await revealButtons.count()) {
    await revealButtons.first().click();
  }
  await expect(page.getByRole("button", { name: "Hide sensitive value" }).first()).toBeVisible();
  const revealedBody = await page.locator("body").innerText();
  for (const value of ["₱1,000.00", "₱100.00", "₱900.00", "Synthetic health deduction"]) {
    expect(revealedBody).toContain(value);
  }

  await page.reload();
  await expect(page.getByText("Sensitive value hidden").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Reveal sensitive value" }).first()).toBeVisible();
  expect(await page.evaluate(() => ({
    url: window.location.href,
    localStorage: Object.keys(window.localStorage),
    sessionStorage: Object.keys(window.sessionStorage),
  }))).toMatchObject({ localStorage: [], sessionStorage: [] });
});

test("returns one generic not found result for unrelated record identities, covers: AC-9", async ({ page }) => {
  const [wrongTimecard] = await sql`select id from timecards where organization_id = ${organizationId} and employee_id <> ${employeeId} and status = 'approved' limit 1`;
  const [foreignTimecard] = await sql`select id from timecards where organization_id <> ${organizationId} and status = 'approved' limit 1`;
  const [wrongPayslip] = await sql`select p.id from payslips p join payouts po on po.id = p.payout_id join payroll_runs r on r.id = po.payroll_run_id where r.organization_id = ${organizationId} and po.employee_id <> ${employeeId} and p.status = 'generated' limit 1`;
  const [foreignPayslip] = await sql`select p.id from payslips p join payouts po on po.id = p.payout_id join payroll_runs r on r.id = po.payroll_run_id where r.organization_id <> ${organizationId} and p.status = 'generated' limit 1`;
  const responsePaths = [
    "/self-service/time/00000000-0000-4000-8000-000000000001",
    "/self-service/payslips/00000000-0000-4000-8000-000000000002",
    `/self-service/time/${wrongTimecard.id}`,
    `/self-service/time/${foreignTimecard.id}`,
    `/self-service/payslips/${wrongPayslip.id}`,
    `/self-service/payslips/${foreignPayslip.id}`,
  ];
  const bodies = [];
  for (const path of responsePaths) {
    await page.goto(path);
    bodies.push(await page.locator("body").innerText());
  }
  expect(bodies[0]).toBe(bodies[1]);
  expect(bodies[0]).not.toContain("00000000-0000-4000-8000-000000000001");
  expect(bodies[0]).not.toContain("00000000-0000-4000-8000-000000000002");
});

test("keeps downloads inside employee, manager, administrator, and organization boundaries, covers: AC-8 and AC-9", async ({ browser }) => {
  const [employeePayslip] = await sql`select p.id from payslips p join payouts po on po.id = p.payout_id where po.employee_id = ${employeeId} and p.status = 'generated' and p.storage_path not like 'self-service/missing-%' order by p.generated_at desc limit 1`;
  const managerPayslipId = fixtureUuid("manager-payslip");
  const manager = await browser.newPage();
  try {
    await signInAs(manager, "self-service-manager@example.test");
    expect((await manager.request.get(`/api/payslips/${employeePayslip.id}/download`)).status()).toBe(404);
    expect((await manager.request.get(`/api/payslips/${managerPayslipId}/download`)).status()).toBe(200);
  } finally { await manager.close(); }
  const administrator = await browser.newPage();
  try {
    await signInAs(administrator, "self-service-administrator@example.test");
    expect((await administrator.request.get(`/api/payslips/${employeePayslip.id}/download`)).status()).toBe(200);
  } finally { await administrator.close(); }
  const otherOrganization = await browser.newPage();
  try {
    await signInAs(otherOrganization, "self-service-other-organization@example.test");
    expect((await otherOrganization.request.get(`/api/payslips/${employeePayslip.id}/download`)).status()).toBe(404);
  } finally { await otherOrganization.close(); }
});

test.afterAll(async () => { if (sql) await sql.end(); });
