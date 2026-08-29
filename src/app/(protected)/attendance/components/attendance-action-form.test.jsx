// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkInAttendance: vi.fn(),
  clockOutAttendance: vi.fn(),
}));

vi.mock("@/app/actions/attendance", () => mocks);

import { AttendanceActionForm } from "./attendance-action-form";

describe("AttendanceActionForm", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.checkInAttendance.mockResolvedValue({ success: true, message: "You are checked in." });
    mocks.clockOutAttendance.mockResolvedValue({ success: true, message: "You are checked out." });
  });

  afterEach(cleanup);

  it("preserves success feedback and submits the action that matches a server refreshed attendance mode, covers: AC-3 and AC-6", async () => {
    const user = userEvent.setup();
    const view = render(<AttendanceActionForm mode="check-in" />);

    await user.click(screen.getByRole("button", { name: "Check in" }));
    await waitFor(() => expect(mocks.checkInAttendance).toHaveBeenCalledOnce());
    expect(await screen.findByText("You are checked in.")).toBeVisible();

    view.rerender(<AttendanceActionForm mode="clock-out" />);
    expect(screen.getByText("You are checked in.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Clock out" }));
    await waitFor(() => expect(mocks.clockOutAttendance).toHaveBeenCalledOnce());
    expect(await screen.findByText("You are checked out.")).toBeVisible();

    view.rerender(<AttendanceActionForm mode="check-in" />);
    expect(screen.getByText("You are checked out.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Check in" }));

    await waitFor(() => expect(mocks.checkInAttendance).toHaveBeenCalledTimes(2));
    expect(mocks.clockOutAttendance).toHaveBeenCalledOnce();
    expect(await screen.findByText("You are checked in.")).toBeVisible();
  });
});
