import { afterEach, describe, expect, it } from "vitest";

import { AttendanceError } from "./errors";
import { assertAttendanceEnabled, isAttendanceEnabled } from "./config";

const originalNodeEnv = process.env.NODE_ENV;
const originalAttendanceEnabled = process.env.ATTENDANCE_ENABLED;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalAttendanceEnabled === undefined) delete process.env.ATTENDANCE_ENABLED;
  else process.env.ATTENDANCE_ENABLED = originalAttendanceEnabled;
});

describe("attendance release setting", () => {
  it("defaults to disabled in production and fails closed, covers: AC-7", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ATTENDANCE_ENABLED;
    expect(isAttendanceEnabled()).toBe(false);
    expect(() => assertAttendanceEnabled()).toThrow(AttendanceError);
  });

  it("defaults to enabled outside production and honors exact true or false, covers: AC-7", () => {
    process.env.NODE_ENV = "test";
    delete process.env.ATTENDANCE_ENABLED;
    expect(isAttendanceEnabled()).toBe(true);
    process.env.ATTENDANCE_ENABLED = "false";
    expect(isAttendanceEnabled()).toBe(false);
    process.env.ATTENDANCE_ENABLED = "true";
    expect(isAttendanceEnabled()).toBe(true);
  });
});
