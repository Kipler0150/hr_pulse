import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";

const email = process.env.SELF_SERVICE_E2E_EMAIL || "self-service-employee@example.test";
const password = process.env.SELF_SERVICE_E2E_PASSWORD || "SelfService!2026";
const failure = process.env.HR_PULSE_SELF_SERVICE_TEST_FAILURE;
const signingPayslipId = fixtureUuid("payslip:0");

function fixtureUuid(label) {
  const chars = createHash("sha256").update(`hr-pulse-self-service:${label}`).digest("hex").slice(0, 32).split("");
  chars[12] = "4"; chars[16] = ["8", "9", "a", "b"][Number.parseInt(chars[16], 16) % 4];
  const value = chars.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function signIn(page) {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("employee self service failure isolation", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env.SELF_SERVICE_E2E_ENABLED || !failure, "Set the local self service failure point to run this isolated check.");
    await signIn(page);
  });

  test("keeps the other home summary available when one query fails, covers: AC-2 and AC-9", async ({ page }) => {
    test.skip(!["home.timecard", "home.payslip"].includes(failure), "This case targets one home summary query.");
    await page.goto("/self-service");
    await expect(page.getByText("Section temporarily unavailable")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Review profile" })).toBeVisible();
    await expect(page.getByRole("link", { name: failure === "home.timecard" ? "View payslips" : "View approved time" })).toBeVisible();
    await expect(page.getByText("Your work records, in one place")).toBeVisible();
  });

  test("renders no portal data when shared access fails, covers: AC-2 and AC-9", async ({ page }) => {
    test.skip(failure !== "access", "This case targets shared access failure.");
    await page.goto("/self-service");
    await expect(page.getByText("Self service is temporarily unavailable.", { exact: true })).toBeVisible();
    await expect(page.getByText("Your work records, in one place")).toHaveCount(0);
  });

  test("returns safe signing failure guidance without a signed link, covers: AC-8 and AC-11", async ({ page }) => {
    test.skip(failure !== "download.signing", "This case targets signed URL creation failure.");
    const response = await page.request.get(`/api/payslips/${signingPayslipId}/download`);
    const body = await response.text();
    expect(response.status()).toBe(503);
    expect(body).toContain("temporarily unavailable");
    expect(body).not.toContain("url");
  });
});
