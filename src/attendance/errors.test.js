import { describe, expect, it } from "vitest";

import { attendanceErrorFromSupabase, attendanceIssue, serializeAttendanceError } from "./errors";

describe("attendance safe errors", () => {
  it("maps expected database conflicts to the fixed catalogue without leaking details, covers: AC-3 and AC-7", () => {
    const error = attendanceErrorFromSupabase({ message: "ALREADY_CHECKED_IN", details: "private database detail" });
    expect(serializeAttendanceError(error)).toEqual(attendanceIssue("ALREADY_CHECKED_IN"));
    expect(JSON.stringify(serializeAttendanceError(error))).not.toContain("private database detail");
  });

  it("maps unknown failures to the fixed retryable response, covers: AC-7", () => {
    expect(serializeAttendanceError(new Error("database secret"))).toEqual(attendanceIssue("ATTENDANCE_REQUEST_FAILED"));
  });
});
