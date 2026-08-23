import { expect, test } from "@playwright/test";

test.describe("authentication public surfaces", () => {
  test("renders an accessible sign in form", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByLabel("Work email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
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