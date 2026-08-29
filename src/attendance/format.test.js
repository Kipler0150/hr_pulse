import { describe, expect, it } from "vitest";

import {
  decodeAttendanceCursor,
  encodeAttendanceCursor,
  formatDuration,
  getDurationMinutes,
  isLongAttendanceInterval,
  parseReviewDate,
  presentAttendanceInterval,
} from "./format";

describe("attendance formatting and pagination", () => {
  it("floors exact timestamps to whole minutes and derives long interval warnings, covers: AC-2 and AC-4", () => {
    const minutes = getDurationMinutes("2026-08-26T00:00:00.000Z", "2026-08-27T00:01:59.999Z");
    expect(minutes).toBe(1441);
    expect(formatDuration(minutes)).toBe("24h 1m");
    expect(isLongAttendanceInterval(minutes)).toBe(true);
    expect(isLongAttendanceInterval(1440)).toBe(false);
    expect(formatDuration(null)).toBe("In progress");
  });

  it("round trips a stable opaque timestamp and ID cursor, covers: AC-3 and AC-4", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    const cursor = encodeAttendanceCursor("2026-08-27T01:02:03.000Z", id);
    expect(decodeAttendanceCursor(cursor)).toEqual({ clockIn: "2026-08-27T01:02:03.000Z", id });
    expect(decodeAttendanceCursor("not-a-cursor")).toBeNull();
  });

  it("accepts only real calendar dates in the fixed review format, covers: AC-4", () => {
    expect(parseReviewDate("2026-02-28")).toBe("2026-02-28");
    expect(parseReviewDate("2026-02-30")).toBeNull();
    expect(parseReviewDate("08/27/2026")).toBeNull();
    expect(parseReviewDate(undefined)).toBeNull();
  });

  it("presents employee names and derives duration without storing it, covers: AC-2, AC-4, and AC-8", () => {
    expect(presentAttendanceInterval({
      id: "interval-id",
      employee_id: "employee-id",
      clock_in: "2026-08-27T00:00:00.000Z",
      clock_out: "2026-08-27T01:10:59.000Z",
      status: "completed",
      employees: { legal_name: "Legal Name", preferred_name: "Preferred Name" },
    })).toMatchObject({
      duration: "1h 10m",
      durationMinutes: 70,
      employeeName: "Preferred Name",
      longInterval: false,
    });
  });
});
