// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AttendanceStatus, LongIntervalWarning } from "./attendance-status";

describe("attendance status", () => {
  afterEach(cleanup);

  it("announces checked out with a noncolor status shape, covers: AC-2 and AC-6", () => {
    render(<AttendanceStatus interval={null} />);

    expect(screen.getByLabelText("Checked out, solid circle")).toHaveTextContent("Checked out");
  });

  it("announces an open interval with a distinct status shape, covers: AC-2 and AC-6", () => {
    render(<AttendanceStatus interval={{ status: "open" }} />);

    expect(screen.getByLabelText("Open, outlined clock")).toHaveTextContent("Open");
  });

  it("explains a session longer than 24 hours, covers: AC-4 and AC-6", () => {
    render(<LongIntervalWarning />);

    expect(screen.getByText("Long interval", { exact: true })).toBeVisible();
    expect(screen.getByText("Long interval: this session was longer than 24 hours.")).toBeVisible();
  });
});
