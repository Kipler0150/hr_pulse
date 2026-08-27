import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("authentication public surfaces", () => {
  test("renders an accessible sign in form", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByLabel("Work email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(({ impact }) => ["critical", "serious"].includes(impact))).toEqual([]);
  });

  for (const width of [360, 768, 1280]) {
    test(`keeps sign in complete at ${width} pixels, covers: AC-4 and AC-7`, async ({ page }) => {
      await page.setViewportSize({ height: 900, width });
      await page.goto("/sign-in");

      await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }

  test("keeps recovery and reset surfaces complete at target widths, covers: AC-4 and AC-7", async ({ page }) => {
    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ height: 900, width });
      for (const [route, heading] of [["/forgot-password", "Recover your access"], ["/reset-password?error_code=otp_expired", "Set a new password"]]) {
        await page.goto(route);
        await expect(page.getByRole("heading", { name: heading })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
    }
  });

  test("shows validation feedback on an invalid recovery email", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Work email").fill("invalid");
    await page.getByRole("button", { name: "Send recovery link" }).click();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  });

  test("redirects unauthenticated dashboard access to sign in", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
