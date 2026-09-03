import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const email = process.env.SAMP_EMAIL;
const password = process.env.SAMP_PASS;

async function expectNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function expectNoSeriousAxeFindings(page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(({ impact }) => ["critical", "serious"].includes(impact))).toEqual([]);
}

async function signInToWorkspace(page) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL(/\/(dashboard|choose-organization|pending-access)/, { timeout: 15_000 }),
    page.getByRole("button", { name: "Sign in" }).click(),
  ]);

  if (/\/choose-organization/.test(page.url())) {
    await page.getByRole("radio").first().check();
    await Promise.all([
      page.waitForURL(/\/dashboard/, { timeout: 15_000 }),
      page.getByRole("button", { name: "Continue" }).click(),
    ]);
  }

  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("product operations", () => {
  test.skip(process.env.HR_PULSE_PRODUCT_OPERATIONS_ENABLED !== "true", "Set HR_PULSE_PRODUCT_OPERATIONS_ENABLED=true for the operations journey");
  test.skip(!email || !password, "SAMP_EMAIL and SAMP_PASS are required for the authenticated journey");

  test("keeps operations traceable, responsive, keyboard usable, and accessible", async ({ page }) => {
    test.setTimeout(90_000);
    await signInToWorkspace(page);

    await page.goto("/operations?window=7d");
    await expect(page.getByRole("heading", { level: 1, name: "See the pulse behind the work" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Adoption milestones" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Payroll queue health" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Audit history" })).toBeVisible();

    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ height: 900, width });
      await page.reload();
      await expect(page.getByRole("heading", { level: 1, name: "See the pulse behind the work" })).toBeVisible();
      await expectNoOverflow(page);
      await expectNoSeriousAxeFindings(page);
    }

    const auditLink = page.getByRole("link", { name: "Audit history" });
    await auditLink.focus();
    await expect(auditLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/operations\/audit$/);
    await expect(page.getByRole("heading", { level: 1, name: "Audit history" })).toBeVisible();
    await page.goto("/operations/audit?action=auth.sign_in_succeeded");
    await expect(page.getByRole("row").filter({ hasText: "auth.sign_in_succeeded" }).first()).toBeVisible();
    await expect(page.getByLabel("From date")).toBeVisible();
    await expect(page.getByLabel("To date")).toBeVisible();
    await expectNoOverflow(page);
    await expectNoSeriousAxeFindings(page);

    await page.getByLabel("From date").focus();
    await expect(page.getByLabel("From date")).toBeFocused();
    await page.getByLabel("To date").focus();
    await expect(page.getByLabel("To date")).toBeFocused();

    await page.goto("/operations/audit?from=not-a-date");
    await expect(page.getByText("Filters could not be applied", { exact: true })).toBeVisible();
    await expect(page.getByText("One or more audit filters are invalid.")).toBeVisible();
    await expectNoOverflow(page);
    await expectNoSeriousAxeFindings(page);

    await page.goto("/operations/audit");
    await expect(page.getByRole("link", { name: "Older events" })).toBeVisible();
    await page.getByRole("link", { name: "Older events" }).click();
    await expect(page).toHaveURL(/\/operations\/audit\?.*cursor=/);
    await expect(page.getByRole("link", { name: "Older events" })).toHaveCount(0);

    await page.goto("/operations/audit?cursor=not-a-valid-cursor");
    await expect(page.getByRole("alert").filter({ hasText: "This audit page link has expired or is invalid." })).toBeVisible();

    await page.goto("/operations/audit");
    const detailsLink = page.getByRole("link", { name: "Details" }).first();
    if (await detailsLink.count()) {
      await detailsLink.focus();
      await expect(detailsLink).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/operations\/audit\/[0-9a-f-]+$/);
      await expect(page.getByRole("heading", { name: "Event contract" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Safe context" })).toBeVisible();
      await expectNoOverflow(page);
      await expectNoSeriousAxeFindings(page);
    }
  });
});
