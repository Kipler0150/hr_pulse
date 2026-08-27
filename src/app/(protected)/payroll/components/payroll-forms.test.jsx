// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assignMembershipAction: vi.fn(),
  goToRunAction: vi.fn(),
  previewPayrollAction: vi.fn(),
  saveEmployeeAction: vi.fn(),
  savePaySettingAction: vi.fn(),
  updateScheduleAction: vi.fn(),
}));

vi.mock("@/app/actions/payroll", () => mocks);

import { EmployeeForm, MembershipForm, PayrollPreview, PaySettingForm, ScheduleForm } from "./payroll-forms";

describe("payroll forms", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(cleanup);

  it("provides persistent labels and named actions for setup inputs, covers: AC-1, AC-2, and AC-10", () => {
    const { unmount } = render(<MembershipForm />);
    expect(screen.getByLabelText("Provisioned profile email")).toBeRequired();
    expect(screen.getByLabelText("Role")).toHaveValue("employee");
    expect(screen.getByRole("button", { name: "Save role access" })).toBeVisible();
    unmount();

    const schedule = render(<ScheduleForm schedule={{ frequency: "monthly", effectiveStartDate: "2026-08-01" }} />);
    expect(screen.getByLabelText("Frequency")).toHaveValue("monthly");
    expect(screen.getByLabelText("First period start")).toHaveValue("2026-08-01");
    schedule.unmount();

    render(<EmployeeForm />);
    expect(screen.getByLabelText("Employee number")).toBeRequired();
    expect(screen.getByLabelText("Work email")).toHaveAttribute("type", "email");
    expect(screen.getByRole("button", { name: "Save employee" })).toBeVisible();
  });

  it("labels gross pay and every named deduction input, covers: AC-2 and AC-10", () => {
    render(<PaySettingForm currency="USD" employeeId="employee-id" frequency="monthly" />);

    expect(screen.getByLabelText("Gross pay per monthly period")).toBeRequired();
    expect(screen.getByRole("group", { name: "Recurring fixed deductions" })).toBeVisible();
    expect(screen.getByLabelText("Deduction 1 name")).toBeVisible();
    expect(screen.getAllByLabelText("Amount")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Add effective pay setting" })).toBeVisible();
  });

  it("renders exact preview totals and a confirmation control, covers: AC-3, AC-4, AC-6, and AC-10", async () => {
    const user = userEvent.setup();
    mocks.previewPayrollAction.mockResolvedValue({
      success: true,
      preview: {
        period: { periodStart: "2026-07-01", periodEnd: "2026-07-31" },
        rows: [{ employeeId: "employee-id", employeeNumber: "SYN-001", legalName: "Synthetic Employee", grossAmountMinor: 500_000, deductionsAmountMinor: 50_000, netAmountMinor: 450_000, deductions: [{ name: "Benefits" }] }],
        totals: { grossTotalMinor: 500_000, deductionsTotalMinor: 50_000, netTotalMinor: 450_000 },
        issues: [], currency: "USD", currencyExponent: 2, token: "opaque-token", expiresAt: "2026-08-26T01:00:00.000Z",
      },
    });
    render(<PayrollPreview />);

    await user.click(screen.getByRole("button", { name: "Preview next payroll" }));

    expect(await screen.findByText(/SYN-001/)).toBeVisible();
    expect(screen.getByText("$5,000.00")).toBeVisible();
    expect(screen.getByText("$4,500.00")).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirm and queue payroll" })).toBeVisible();
  });

  it("shows every structured blocker and withholds confirmation, covers: AC-3 and AC-10", async () => {
    const user = userEvent.setup();
    mocks.previewPayrollAction.mockResolvedValue({
      success: false,
      preview: {
        rows: [], token: null,
        issues: [
          { code: "NO_ELIGIBLE_EMPLOYEES", employeeId: null, message: "No employees are eligible for this payroll period.", guidance: "Add an active employee." },
          { code: "PAY_SETTING_MISSING", employeeId: "employee-id", message: "An employee does not have pay that covers the full period.", guidance: "Add compatible pay." },
        ],
      },
    });
    render(<PayrollPreview />);

    await user.click(screen.getByRole("button", { name: "Preview next payroll" }));

    expect(await screen.findByText("No employees are eligible for this payroll period.")).toBeVisible();
    expect(screen.getByText("An employee does not have pay that covers the full period.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Confirm and queue payroll" })).not.toBeInTheDocument();
  });
});
