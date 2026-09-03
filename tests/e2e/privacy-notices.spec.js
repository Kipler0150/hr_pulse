import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function expectAccessible(page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(({ impact }) => ["critical", "serious"].includes(impact))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.describe("privacy notices", () => {
  test("renders the reviewed notices publicly and responsively", async ({ page }) => {
    for (const [route, heading] of [["/privacy", "Privacy notice"], ["/terms", "Terms of use"]]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page.getByText("2026-09-03-v1", { exact: true })).toBeVisible();
      for (const width of [360, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.reload();
        await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
        await expectAccessible(page);
      }
    }
  });

  test("keeps protected privacy surfaces behind authentication", async ({ page }) => {
    for (const route of ["/settings/privacy", "/admin/privacy"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
    }
  });
});
