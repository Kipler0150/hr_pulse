import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
import postgres from "postgres";

const email = process.env.SELF_SERVICE_E2E_EMAIL || "self-service-employee@example.test";
const password = process.env.SELF_SERVICE_E2E_PASSWORD || "SelfService!2026";
const managerEmail = process.env.SELF_SERVICE_E2E_MANAGER_EMAIL || "self-service-manager@example.test";
const administratorEmail = process.env.SELF_SERVICE_E2E_ADMINISTRATOR_EMAIL || "self-service-administrator@example.test";
const sql = process.env.DATABASE_URL ? postgres(process.env.DATABASE_URL, { max: 1 }) : null;

function fixtureUuid(label) {
  const chars = createHash("sha256").update(`hr-pulse-self-service:${label}`).digest("hex").slice(0, 32).split("");
  chars[12] = "4"; chars[16] = ["8", "9", "a", "b"][Number.parseInt(chars[16], 16) % 4];
  const value = chars.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

const employeeId = fixtureUuid("employee");
const managerPayslipId = fixtureUuid("manager-payslip");
const missingPathPayslipId = fixtureUuid("missing-path-payslip");
const organizationName = "HR Pulse Self Service Verification";

async function signIn(page) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function signInAs(page, role) {
  const roleEmail = role === "manager" ? managerEmail : administratorEmail;
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(roleEmail);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL(/\/(dashboard|choose-organization|pending-access)/),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
  if (/\/choose-organization/.test(page.url())) {
    await page.getByRole("radio", { name: new RegExp(`${organizationName} ${role}`), exact: true }).check();
    await Promise.all([
      page.waitForURL(/\/dashboard$/),
      page.getByRole("button", { name: "Continue" }).click(),
    ]);
  }
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function employeePayslipId() {
  const [row] = await sql`select p.id from payslips p join payouts po on po.id = p.payout_id where po.employee_id = ${employeeId} and p.status = 'generated' and p.storage_path not like 'self-service/missing-%' order by p.generated_at desc limit 1`;
  return row.id;
}

test.describe("employee self service portal", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env.SELF_SERVICE_E2E_ENABLED, "Set SELF_SERVICE_E2E_ENABLED=true after seeding local self service fixtures.");
    await signIn(page);
  });

  test("shows private home summaries without pay amounts, covers: AC-1, AC-2, AC-7", async ({ page }) => {
    await page.goto("/self-service");
    await expect(page.getByRole("heading", { name: "Your work records, in one place" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Review profile" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View approved time" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View payslips" })).toBeVisible();
    await expect(page.getByText("₱1,000.00")).toHaveCount(0);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(({ impact }) => ["critical", "serious"].includes(impact))).toEqual([]);
  });

  test("saves a valid profile and announces success, covers: AC-3, AC-4, AC-10", async ({ page }) => {
    await page.goto("/self-service/profile");
    await page.getByLabel("Preferred name").fill("Sam Updated");
    await page.getByLabel("Phone").fill("+639171234568");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.locator('[data-slot="alert"]')).toHaveAttribute("role", "status");
    await expect(page.locator('[data-slot="alert"]')).toContainText("Profile updated");
    await expect(page.getByText("Your contact details are current.")).toBeVisible();
    await expect(page.locator("aside")).toContainText("Sam Updated");
  });

  test("marks both profile inputs invalid after rejected input, covers: AC-3 and AC-10", async ({ page }) => {
    await page.goto("/self-service/profile");
    await page.getByLabel("Preferred name").fill("Valid name");
    await page.getByLabel("Phone").fill("not a phone");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByLabel("Preferred name")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Phone")).toHaveAttribute("aria-invalid", "true");
  });

  test("keeps profile controls keyboard reachable in order, covers: AC-10", async ({ page }) => {
    await page.goto("/self-service/profile");
    const preferredName = page.getByLabel("Preferred name");
    const phone = page.getByLabel("Phone");
    const save = page.getByRole("button", { name: "Save profile" });
    await expect(preferredName).toBeVisible();
    await preferredName.focus();
    await expect(preferredName).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(phone).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(save).toBeFocused();
  });

  test("shows only approved time and stored source evidence, covers: AC-5 and AC-10", async ({ page }) => {
    await page.goto("/self-service/time");
    await expect(page.getByRole("heading", { name: "Your finalized time evidence" })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(12);
    await page.getByRole("link", { name: "View evidence" }).first().click();
    await expect(page.getByRole("heading", { name: "Attendance source snapshots" })).toBeVisible();
    await expect(page.getByText("Clock in")).toBeVisible();
    await expect(page.getByText("Asia/Manila")).toBeVisible();
  });

  test("rejects invalid history cursors with a first page link, covers: AC-5, AC-6, AC-9", async ({ page }) => {
    await page.goto("/self-service/time?cursor=not-a-valid-cursor");
    await expect(page.getByRole("alert").filter({ hasText: "This page link is invalid" })).toBeVisible();
    await expect(page.getByRole("link", { name: "First page" })).toHaveAttribute("href", "/self-service/time");
    await page.goto("/self-service/payslips?cursor=not-a-valid-cursor");
    await expect(page.getByRole("alert").filter({ hasText: "This page link is invalid" })).toBeVisible();
    await expect(page.getByRole("link", { name: "First page" })).toHaveAttribute("href", "/self-service/payslips");
  });

  test("returns a generic not found response for malformed detail identifiers, covers: AC-5, AC-6, AC-9", async ({ page }) => {
    const timecardResponse = await page.goto("/self-service/time/not-a-uuid");
    expect(timecardResponse.status()).not.toBe(500);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
    const payslipResponse = await page.goto("/self-service/payslips/not-a-uuid");
    expect(payslipResponse.status()).not.toBe(500);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  });

  test("masks payslip values until reveal and downloads verified document, covers: AC-6, AC-7, AC-8, AC-11", async ({ page }) => {
    await page.goto("/self-service/payslips");
    await page.getByRole("link", { name: "View payslip" }).first().click();
    await expect(page.getByText("Sensitive value hidden").first()).toBeVisible();
    await page.getByRole("button", { name: "Reveal sensitive value" }).first().click();
    await expect(page.getByRole("button", { name: "Hide sensitive value" }).first()).toBeVisible();
    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/payslips/") && response.url().endsWith("/download"));
    await page.getByRole("button", { name: "Download PDF" }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    await expect(page).not.toHaveURL(/\/api\/payslips\/.*\/download$/);
  });

  test("keeps payslip downloads within role and employee boundaries, covers: AC-8 and AC-9", async ({ browser }) => {
    const employeePayslip = await employeePayslipId();
    const manager = await browser.newPage();
    try {
      await signInAs(manager, "manager");
      const denied = await manager.request.get(`/api/payslips/${employeePayslip}/download`);
      expect(denied.status()).toBe(404);
      const own = await manager.request.get(`/api/payslips/${managerPayslipId}/download`);
      expect(own.status()).toBe(200);
    } finally { await manager.close(); }
    const administrator = await browser.newPage();
    try {
      await signInAs(administrator, "administrator");
      const allowed = await administrator.request.get(`/api/payslips/${employeePayslip}/download`);
      expect(allowed.status()).toBe(200);
    } finally { await administrator.close(); }
  });

  test("stops a revoked employee session before reads, covers: AC-1, AC-4, AC-9", async ({ browser }) => {
    test.skip(!sql, "Local database is required for revocation isolation.");
    const page = await browser.newPage();
    try {
      await signIn(page);
      await sql`update employees set status = 'inactive' where id = ${employeeId}`;
      await page.goto("/self-service");
      await expect(page).toHaveURL(/\/pending-access$/);
    } finally {
      await sql`update employees set status = 'active' where id = ${employeeId}`;
      await page.close();
    }
  });

  test("stops a profile deactivation before the next self service read, covers: AC-1 and AC-4", async ({ browser }) => {
    test.skip(!sql, "Local database is required for profile deactivation isolation.");
    const page = await browser.newPage();
    try {
      await signIn(page);
      await sql`update profiles set status = 'inactive' where email = ${email}`;
      await page.goto("/self-service");
      await expect(page).toHaveURL(/\/pending-access$/);
    } finally {
      await sql`update profiles set status = 'active' where email = ${email}`;
      await page.close();
    }
  });

  test("stops membership deactivation before the next self service read, covers: AC-1 and AC-4", async ({ browser }) => {
    test.skip(!sql, "Local database is required for membership deactivation isolation.");
    const page = await browser.newPage();
    try {
      await signIn(page);
      await sql`update memberships set status = 'inactive' where profile_id = (select id from profiles where email = ${email}) and organization_id = ${fixtureUuid("organization")}`;
      await page.goto("/self-service");
      await expect(page).toHaveURL(/\/pending-access$/);
    } finally {
      await sql`update memberships set status = 'active' where profile_id = (select id from profiles where email = ${email}) and organization_id = ${fixtureUuid("organization")}`;
      await page.close();
    }
  });

  test("rejects a repeated profile mutation after membership deactivation without replay data, covers: AC-4", async ({ browser }) => {
    test.skip(!sql, "Local database is required for mutation deactivation isolation.");
    const page = await browser.newPage();
    try {
      await signIn(page);
      await page.goto("/self-service/profile");
      const [before] = await sql`select version, preferred_name, phone from employees where id = ${employeeId}`;
      await sql`update memberships set status = 'inactive' where profile_id = (select id from profiles where email = ${email}) and organization_id = ${fixtureUuid("organization")}`;
      await page.getByLabel("Preferred name").fill("Deactivated retry value");
      const save = page.getByRole("button", { name: "Save profile" });
      await save.click();
      await save.click();
      await expect(page.locator('[data-slot="alert"]')).toContainText(/employee access is not ready/i);
      const [after] = await sql`select version, preferred_name, phone from employees where id = ${employeeId}`;
      expect(after.version).toBe(before.version);
      expect(after.preferred_name).toBe(before.preferred_name);
      expect(after.phone).toBe(before.phone);
    } finally {
      await sql`update memberships set status = 'active' where profile_id = (select id from profiles where email = ${email}) and organization_id = ${fixtureUuid("organization")}`;
      await page.close();
    }
  });

  test("returns safe integrity guidance without a signed link, covers: AC-8 and AC-11", async ({ page }) => {
    test.skip(!sql, "Local database is required for integrity isolation.");
    const payslipId = await employeePayslipId();
    const [original] = await sql`select storage_path, sha256 from payslips where id = ${payslipId}`;
    try {
      await sql`alter table public.payslips disable trigger payslips_terminal_immutable`;
      await sql`update payslips set sha256 = ${"0".repeat(64)} where id = ${payslipId}`;
      await signIn(page);
      const response = await page.request.get(`/api/payslips/${payslipId}/download`);
      expect(response.status()).toBe(503);
      const body = await response.text();
      expect(body).not.toContain("\"url\"");
      expect(body).toContain("temporarily unavailable");
    } finally {
      await sql`update payslips set storage_path = ${original.storage_path}, sha256 = ${original.sha256} where id = ${payslipId}`;
      await sql`alter table public.payslips enable trigger payslips_terminal_immutable`;
    }
  });

  test("returns safe Storage guidance for a generated payslip whose object is missing, covers: AC-8 and AC-11", async ({ page }) => {
    const response = await page.request.get(`/api/payslips/${missingPathPayslipId}/download`);
    const body = await response.text();

    expect(response.status()).toBe(503);
    expect(body).toContain("temporarily unavailable");
    expect(body).not.toContain("url");
  });
});

test.afterAll(async () => { if (sql) await sql.end(); });
