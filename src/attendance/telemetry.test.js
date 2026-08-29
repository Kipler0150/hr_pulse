import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));

import { AttendanceError } from "./errors";
import { reportAttendanceFailure } from "./telemetry";

describe("attendance telemetry", () => {
  beforeEach(() => vi.resetAllMocks());

  it("replaces provider details with a safe error and fallback identifiers, covers: AC-7", () => {
    reportAttendanceFailure(new Error("private provider detail"), { action: "attendance.read" });

    expect(mocks.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "ATTENDANCE_REQUEST_FAILED" }),
      {
        tags: {
          action: "attendance.read",
          code: "ATTENDANCE_REQUEST_FAILED",
          employeeId: "none",
          intervalId: "none",
          organizationId: "unknown",
        },
      },
    );
    expect(JSON.stringify(mocks.captureException.mock.calls)).not.toContain("private provider detail");
  });

  it("ignores expected conflicts and reports each unexpected error only once, covers: AC-3 and AC-7", () => {
    reportAttendanceFailure(new AttendanceError("ALREADY_CHECKED_IN"), { action: "attendance.check_in" });
    const unexpected = new AttendanceError("ATTENDANCE_REQUEST_FAILED");
    reportAttendanceFailure(unexpected, { action: "attendance.check_in", organizationId: "organization-id" });
    reportAttendanceFailure(unexpected, { action: "attendance.check_in", organizationId: "organization-id" });

    expect(mocks.captureException).toHaveBeenCalledOnce();
  });
});
