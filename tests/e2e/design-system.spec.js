import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("design system gallery", () => {
  for (const width of [360, 768, 1280]) {
    test(`renders the gallery without horizontal overflow at ${width} pixels, covers: AC-4, AC-6, and AC-8`, async ({ page }) => {
      await page.setViewportSize({ height: 1000, width });
      await page.goto("/design-system");

      await expect(page.getByRole("heading", { level: 1, name: "Design system and interface foundation" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }

  test("persists explicit and system theme choices through server rendering, covers: AC-1 and AC-2", async ({ page }) => {
    await page.goto("/design-system");

    await page.getByRole("button", { name: "Dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.getByRole("button", { name: "System theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
    await expect(page.locator("html")).not.toHaveClass(/(?:^|\s)(?:light|dark)(?:\s|$)/);
  });

  test("falls back to system for a malformed theme cookie, covers: AC-2", async ({ context, page }) => {
    await context.addCookies([{ name: "hr_pulse_theme", value: "sepia", url: "http://localhost:3000" }]);
    await page.goto("/design-system");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
  });

  test("changes theme through an ordinary form without client JavaScript, covers: AC-2", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("http://localhost:3000/design-system");

    await page.getByRole("button", { name: "Dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await context.close();
  });

  test("supports keyboard sheet navigation and restores focus, covers: AC-5 and AC-7", async ({ page }) => {
    await page.goto("/design-system");
    const trigger = page.getByRole("button", { name: "Open detail sheet" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Attendance detail" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Attendance detail" })).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("honors reduced motion, touch targets, and non-color status cues, covers: AC-7", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ height: 1000, width: 360 });
    await page.goto("/design-system");

    const themeButton = page.getByRole("button", { name: "System theme" });
    const themeBox = await themeButton.boundingBox();
    expect(themeBox.width).toBeGreaterThanOrEqual(44);
    expect(themeBox.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByLabel("Approved, solid circle").first()).toBeVisible();

    const animationDuration = await page.locator('[data-slot="skeleton"]').first().evaluate((element) => getComputedStyle(element).animationDuration);
    expect(["0.01ms", "0.00001s", "1e-05s"]).toContain(animationDuration);
  });

  for (const theme of ["Light", "Dark"]) {
    test(`has no serious or critical axe findings in ${theme.toLowerCase()} mode, covers: AC-7`, async ({ page }) => {
      await page.goto("/design-system");
      await page.getByRole("button", { name: `${theme} theme` }).click();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.filter(({ impact }) => ["critical", "serious"].includes(impact))).toEqual([]);
    });
  }
});
