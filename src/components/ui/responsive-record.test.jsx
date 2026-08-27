// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { ResponsiveRecord } from "@/components/ui/responsive-record";

const props = {
  priorityValues: [{ label: "Employee", value: "Sample employee" }],
  secondaryValues: [{ label: "Timezone", value: "Asia/Manila" }],
  title: "August payroll preview",
};

describe("ResponsiveRecord", () => {
  afterEach(cleanup);

  it("keeps priority and action values available, covers: AC-5 and AC-6", () => {
    render(<ResponsiveRecord {...props} action={<button type="button">Review</button>} />);

    expect(screen.getByRole("heading", { name: "August payroll preview" })).toBeVisible();
    expect(screen.getByText("Sample employee")).toBeVisible();
    expect(screen.getByRole("button", { name: "Review" })).toBeVisible();
  });

  it("exposes secondary values through keyboard operable disclosure, covers: AC-6 and AC-7", async () => {
    const user = userEvent.setup();
    render(<ResponsiveRecord {...props} />);

    const disclosure = screen.getByText("View record details");
    await user.click(disclosure);
    expect(disclosure.closest("details")).toHaveAttribute("open");
    expect(screen.getAllByText("Asia/Manila")).toHaveLength(2);
  });
});
