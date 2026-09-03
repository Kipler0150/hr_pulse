import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const localDatabase = /@(127\.0\.0\.1|localhost):/.test(databaseUrl ?? "");
const localSupabase = /https?:\/\/(127\.0\.0\.1|localhost)(?::|\/)/.test(supabaseUrl ?? "");
const canCreateFixture = Boolean(
  process.env.HR_PULSE_PRIVACY_ENABLED === "true"
  && databaseUrl
  && supabaseUrl
  && serviceRoleKey
  && localDatabase
  && localSupabase,
);

async function signIn(page, account) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 15_000 }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);
}

async function currentConsent(sql, organizationId, profileId) {
  const [row] = await sql`
    select granted
    from privacy_consents
    where organization_id = ${organizationId}
      and profile_id = ${profileId}
      and superseded_at is null
    limit 1
  `;
  return row?.granted ?? null;
}

async function expectNoSeriousAxeFindings(page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(({ impact }) => ["critical", "serious"].includes(impact))).toEqual([]);
}

async function cleanFixture(sql, fixture) {
  if (!sql || !fixture.organizationId) return;
  await sql.begin(async (transaction) => {
    await transaction`set local session_replication_role = replica`;
    await transaction`delete from audit_events where organization_id = ${fixture.organizationId}`;
    await transaction`delete from product_events where organization_id = ${fixture.organizationId}`;
    await transaction`delete from operation_failures where organization_id = ${fixture.organizationId}`;
    await transaction`delete from privacy_deletion_executions where organization_id = ${fixture.organizationId}`;
    await transaction`delete from privacy_requests where organization_id = ${fixture.organizationId}`;
    await transaction`delete from privacy_holds where organization_id = ${fixture.organizationId}`;
    await transaction`delete from privacy_consents where organization_id = ${fixture.organizationId}`;
    await transaction`delete from employees where organization_id = ${fixture.organizationId}`;
    await transaction`delete from memberships where organization_id = ${fixture.organizationId}`;
    await transaction`delete from profiles where id = ${fixture.profileId}`;
    await transaction`delete from organizations where id = ${fixture.organizationId}`;
  });
}

test.describe("privacy controls", () => {
  test.skip(!canCreateFixture, "A local Supabase environment with privacy enabled is required");

  let admin;
  let sql;
  let fixture;

  test.beforeEach(async () => {
    sql = postgres(databaseUrl, { max: 1 });
    admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const nonce = crypto.randomUUID();
    const account = {
      email: `privacy-controls-${nonce}@example.test`,
      password: `Privacy!${nonce}`,
    };
    const [organization] = await sql`
      insert into organizations (name, slug, timezone, default_currency)
      values (${`Privacy controls ${nonce}`}, ${`privacy-controls-${nonce}`}, 'Asia/Manila', 'PHP')
      returning id
    `;
    fixture = {
      account,
      organizationId: organization.id,
      profileId: null,
      userId: null,
    };
    const { data, error } = await admin.auth.admin.createUser({
      email: account.email,
      email_confirm: true,
      password: account.password,
    });
    if (error) throw error;
    fixture.userId = data.user.id;
    const [profile] = await sql`
      insert into profiles (auth_user_id, email, display_name)
      values (${data.user.id}, ${account.email}, 'Privacy Controls Employee')
      returning id
    `;
    fixture.profileId = profile.id;
    await sql`
      insert into memberships (organization_id, profile_id, role, status)
      values (${organization.id}, ${profile.id}, 'employee', 'active')
    `;
    await sql`
      insert into employees (organization_id, profile_id, employee_number, legal_name, email, hire_date, status)
      values (${organization.id}, ${profile.id}, ${`PRIV-${nonce.slice(0, 8)}`}, 'Privacy Controls Employee', ${account.email}, current_date, 'active')
    `;
  });

  test.afterEach(async () => {
    await cleanFixture(sql, fixture ?? {});
    if (admin && fixture?.userId) await admin.auth.admin.deleteUser(fixture.userId);
    if (sql) await sql.end();
    admin = null;
    sql = null;
    fixture = null;
  });

  test("keeps the consent control synchronized after saving, covers AC-2, AC-3, AC-4, AC-5, and AC-15", async ({ page }) => {
    await signIn(page, fixture.account);
    await page.goto("/settings/privacy");
    await expectNoSeriousAxeFindings(page);

    const checkbox = page.getByRole("checkbox", { name: "Allow product analytics" });
    const nativeCheckbox = page.locator('input[type="checkbox"]');
    const saveButton = page.getByRole("button", { name: "Save analytics choice" });

    await expect(checkbox).toHaveAttribute("aria-checked", "false");
    await expect(nativeCheckbox).not.toBeChecked();

    await checkbox.click();
    await expect(checkbox).toHaveAttribute("aria-checked", "true");
    await expect(nativeCheckbox).toBeChecked();
    await saveButton.click();
    await expect.poll(() => currentConsent(sql, fixture.organizationId, fixture.profileId)).toBe(true);
    await expect(nativeCheckbox).toBeChecked();

    await checkbox.click();
    await expect(checkbox).toHaveAttribute("aria-checked", "false");
    await expect(nativeCheckbox).not.toBeChecked();
    await saveButton.click();
    await expect.poll(() => currentConsent(sql, fixture.organizationId, fixture.profileId)).toBe(false);
    await expect(checkbox).toHaveAttribute("aria-checked", "false");
    await expect(nativeCheckbox).not.toBeChecked();

    await checkbox.focus();
    await checkbox.press("Space");
    await expect(checkbox).toHaveAttribute("aria-checked", "true");
    await expect(nativeCheckbox).toBeChecked();
  });
});
