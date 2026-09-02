import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const email = process.env.SELF_SERVICE_E2E_EMAIL || "self-service-employee@example.test";
const password = process.env.SELF_SERVICE_E2E_PASSWORD || "SelfService!2026";

async function signIn(page) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("supports the self service visual matrix, covers: AC-10", async ({ page }) => {
  test.skip(!process.env.SELF_SERVICE_E2E_ENABLED, "Set SELF_SERVICE_E2E_ENABLED=true after seeding local self service fixtures.");
  await signIn(page);
  await page.route("**/self-service", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  const loadingNavigation = page.goto("/self-service");
  await expect(page.getByRole("main", { name: "Loading employee self service" })).toHaveAttribute("aria-busy", "true");
  await loadingNavigation;
  await page.unroute("**/self-service");
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/self-service");
    await expect(page.getByRole("heading", { name: "Your work records, in one place" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, `unexpected horizontal overflow at ${width}px`).toBe(false);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter(({ impact }) => ["critical", "serious"].includes(impact))).toEqual([]);
  }
  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe("dark");
  const darkResults = await new AxeBuilder({ page }).analyze();
  expect(darkResults.violations.filter(({ impact }) => ["critical", "serious"].includes(impact))).toEqual([]);
});
