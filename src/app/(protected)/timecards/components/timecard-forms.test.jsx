// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  approveTimecardAction: vi.fn(),
  correctAttendanceIntervalAction: vi.fn(),
  prepareTimecardAction: vi.fn(),
  returnTimecardAction: vi.fn(),
  saveOvertimePolicyAction: vi.fn(),
  submitTimecardAction: vi.fn(),
}));

vi.mock("@/app/actions/timecards", () => mocks);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ReviewTimecardForms, SubmitTimecardForm } from "./timecard-forms";

const card = { id: "card-id", status: "draft", version: 1, workedSeconds: 3600 };

describe("timecard workflow announcements", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(cleanup);

  it("keeps the submission result after submitted controls disappear", async () => {
    mocks.submitTimecardAction.mockResolvedValue({ success: true, status: "submitted", version: 2 });
    const user = userEvent.setup();
    const view = render(<SubmitTimecardForm canSubmit card={card} requestId="request-id" />);

    await user.click(screen.getByRole("button", { name: "Submit timecard" }));
    expect(await screen.findByText("Timecard submitted")).toBeVisible();

    view.rerender(<SubmitTimecardForm canSubmit={false} card={{ ...card, status: "submitted", version: 2 }} requestId="request-id" />);
    expect(screen.getByText("Timecard submitted")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Submit timecard" })).not.toBeInTheDocument();
  });

  it("keeps the return result after reviewer controls disappear", async () => {
    mocks.returnTimecardAction.mockResolvedValue({ success: true, status: "returned", version: 2 });
    const user = userEvent.setup();
    const view = render(<ReviewTimecardForms canAct card={{ ...card, status: "submitted" }} isAdministrator={false} requestIds={{ approve: "approve-id", return: "return-id" }} />);

    await user.type(screen.getByLabelText("Return note"), "Please review the source time.");
    await user.click(screen.getByRole("button", { name: "Return for changes" }));
    expect(await screen.findByText("Timecard returned")).toBeVisible();

    view.rerender(<ReviewTimecardForms canAct={false} card={{ ...card, status: "returned", version: 2 }} isAdministrator={false} requestIds={{ approve: "approve-id", return: "return-id" }} />);
    expect(screen.getByText("Timecard returned")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Return for changes" })).not.toBeInTheDocument();
  });
});
