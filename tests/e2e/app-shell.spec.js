import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const email = process.env.SAMP_EMAIL;
const password = process.env.SAMP_PASS;

test.describe("authenticated application shell", () => {
  test.skip(!email || !password, "SAMP_EMAIL and SAMP_PASS are required for the authenticated journey");

  test("keeps the signed in dashboard complete on desktop and mobile, covers: AC-3, AC-4, AC-7, and AC-10", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/sign-in");
    await page.getByLabel("Work email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL(/\/(dashboard|choose-organization|pending-access)/);
    await expect(page).toHaveURL(/\/choose-organization/);
    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ height: 900, width });
      await page.reload();
      await expect(page.getByRole("heading", { name: "Choose your workspace" })).toBeVisible();
      await expect(page.getByRole("radio").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await page.setViewportSize({ height: 900, width: 1280 });
    await expect(page.getByRole("heading", { level: 1, name: "Your work, in view" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Dashboard" })).toBeVisible();
    const desktopAxe = await new AxeBuilder({ page }).analyze();
    expect(desktopAxe.violations.filter(({ impact }) => ["critical", "serious"].includes(impact))).toEqual([]);

    await page.setViewportSize({ height: 900, width: 768 });
    await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Dashboard" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.setViewportSize({ height: 900, width: 360 });
    await page.reload();
    const trigger = page.getByRole("button", { name: "Open navigation" });
    await trigger.click();
    await expect(page.getByRole("dialog", { name: "HR Pulse navigation" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await trigger.click();
    await page.getByRole("dialog", { name: "HR Pulse navigation" }).getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
