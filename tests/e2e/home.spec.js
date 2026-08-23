import { expect, test } from "@playwright/test";

test("renders the HR Pulse foundation page", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1 }),
  ).toHaveText("Payroll and attendance, in one dependable workspace.");
  await expect(
    page.getByText(
      "The application foundation is ready for the first payroll completion thread.",
    ),
  ).toBeVisible();
});