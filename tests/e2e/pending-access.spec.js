import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const canCreateFixture = Boolean(supabaseUrl && serviceRoleKey);

test.describe("pending access", () => {
  let admin;
  let fixture;

  test.beforeAll(async () => {
    test.skip(!canCreateFixture, "Supabase admin environment is required for the pending access journey");
    admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const nonce = crypto.randomUUID();
    const email = `hr-pulse-e2e-${nonce}@example.test`;
    const password = `E2e!${nonce}`;
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, password });
    if (error) throw error;
    fixture = { email, password, userId: data.user.id };
  });

  test.afterAll(async () => {
    if (admin && fixture?.userId) await admin.auth.admin.deleteUser(fixture.userId);
  });

  test("shows an unprovisioned user a complete pending screen at each target width, covers: AC-4 and AC-10", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/sign-in");
    await page.getByLabel("Work email").fill(fixture.email);
    await page.getByLabel("Password").fill(fixture.password);
    await Promise.all([
      page.waitForURL(/\/pending-access/, { timeout: 15_000 }),
      page.getByRole("button", { name: "Sign in" }).click(),
    ]);

    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ height: 900, width });
      await page.reload();
      await expect(page.getByRole("heading", { name: "Your access is being prepared" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(({ impact }) => ["critical", "serious"].includes(impact))).toEqual([]);
  });
});
