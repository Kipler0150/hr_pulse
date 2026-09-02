import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const canCreateFixture = Boolean(databaseUrl && supabaseUrl && serviceRoleKey);
const password = process.env.SELF_SERVICE_E2E_PASSWORD || "SelfService!2026";
const email = process.env.SELF_SERVICE_E2E_ADMINISTRATOR_EMAIL || "self-service-administrator@example.test";

async function signIn(page) {
  return signInAccount(page, { email, password });
}

async function signInAccount(page, account) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/(dashboard|choose-organization)(\?|$)/);
  if (page.url().includes("choose-organization")) {
    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }
}

test.describe("employee self service regressions", () => {
  test("administrator employee creation and editing preserve access and advance version, covers: AC-3 and AC-4", async ({ page }) => {
    test.skip(!canCreateFixture, "Local Supabase credentials are required for the administrator regression journey");
    const sql = postgres(databaseUrl, { max: 1 });
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const nonce = crypto.randomUUID().slice(0, 8);
    let employeeId;
    try {
      await signIn(page);
      await page.goto("/payroll/employees");
      await page.getByLabel("Employee number").fill(`REG-${nonce}`);
      await page.getByLabel("Legal name").fill(`Regression Employee ${nonce}`);
      await page.getByLabel("Preferred name").fill(`Regression ${nonce}`);
      await page.getByLabel("Work email").fill(`regression-${nonce}@example.test`);
      await page.getByLabel("Hire date").fill("2026-01-01");
      await page.getByRole("button", { name: "Save employee" }).click();
      await expect(page.getByText("Changes saved")).toBeVisible();

      const [created] = await sql`select id, version, status from employees where employee_number = ${`REG-${nonce}`}`;
      expect(created).toMatchObject({ version: 1, status: "active" });
      employeeId = created.id;

      await page.goto(`/payroll/employees/${employeeId}`);
      await page.getByLabel("Legal name").fill(`Edited Employee ${nonce}`);
      await page.getByRole("button", { name: "Save employee" }).click();
      await expect(page.getByText("Changes saved")).toBeVisible();
      const [edited] = await sql`select legal_name, version, status from employees where id = ${employeeId}`;
      expect(edited).toMatchObject({ legal_name: `Edited Employee ${nonce}`, version: 2, status: "active" });
    } finally {
      if (employeeId) await sql`delete from employees where id = ${employeeId}`;
      await sql.end();
      await admin.auth.signOut();
    }
  });

  test("renders an empty portal at every supported width and theme, covers: AC-2 and AC-10", async ({ page }) => {
    test.skip(!canCreateFixture, "Local Supabase credentials are required for the empty state journey");
    const sql = postgres(databaseUrl, { max: 1 });
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const nonce = crypto.randomUUID().slice(0, 8);
    const account = { email: `empty-portal-${nonce}@example.test`, password: `Empty!${nonce}` };
    let organizationId;
    let profileId;
    let employeeId;
    let userId;
    try {
      const created = await admin.auth.admin.createUser({ email: account.email, email_confirm: true, password: account.password });
      if (created.error) throw created.error;
      userId = created.data.user.id;
      const [organization] = await sql`
        insert into organizations (name, slug, timezone, default_currency)
        values (${`Empty portal ${nonce}`}, ${`empty-portal-${nonce}`}, 'Asia/Manila', 'PHP')
        returning id
      `;
      organizationId = organization.id;
      const [profile] = await sql`
        insert into profiles (auth_user_id, email, display_name)
        values (${userId}, ${account.email}, ${`Empty portal ${nonce}`})
        returning id
      `;
      profileId = profile.id;
      const [employee] = await sql`
        insert into employees (organization_id, profile_id, employee_number, legal_name, email, hire_date, status)
        values (${organizationId}, ${profileId}, ${`EMPTY-${nonce}`}, ${`Empty employee ${nonce}`}, ${account.email}, '2026-01-01', 'active')
        returning id
      `;
      employeeId = employee.id;
      await sql`insert into memberships (organization_id, profile_id, role, status) values (${organizationId}, ${profileId}, 'employee', 'active')`;

      await signInAccount(page, account);
      await page.goto("/self-service");
      for (const theme of ["light", "dark"]) {
        if (theme === "dark") {
          await page.getByRole("button", { name: "Dark theme" }).click();
          await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe("dark");
        }
        for (const width of [360, 768, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          await page.reload();
          await expect(page.getByRole("heading", { name: "Your work records, in one place" })).toBeVisible();
          await expect(page.getByText("No approved timecards are available yet.")).toBeVisible();
          await expect(page.getByText("No generated payslips are available yet.")).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
        }
      }
    } finally {
      if (employeeId) await sql`delete from employees where id = ${employeeId}`;
      if (profileId) await sql`delete from memberships where profile_id = ${profileId}`;
      if (profileId) await sql`delete from profiles where id = ${profileId}`;
      if (organizationId) await sql`delete from organizations where id = ${organizationId}`;
      if (userId) await admin.auth.admin.deleteUser(userId);
      await sql.end();
    }
  });
});
