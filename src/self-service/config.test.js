import { afterEach, describe, expect, it } from "vitest";

import { assertSelfServiceTestFailure, isSelfServiceEnabled } from "./config";
import { SelfServiceError } from "./errors";

const original = { nodeEnv: process.env.NODE_ENV, enabled: process.env.HR_PULSE_SELF_SERVICE_ENABLED, realData: process.env.HR_PULSE_REAL_EMPLOYEE_DATA_ENABLED, failure: process.env.HR_PULSE_SELF_SERVICE_TEST_FAILURE };

afterEach(() => {
  process.env.NODE_ENV = original.nodeEnv;
  process.env.HR_PULSE_SELF_SERVICE_ENABLED = original.enabled;
  process.env.HR_PULSE_REAL_EMPLOYEE_DATA_ENABLED = original.realData;
  process.env.HR_PULSE_SELF_SERVICE_TEST_FAILURE = original.failure;
});

describe("self service release gates", () => {
  it("requires both exact production release flags", () => {
    process.env.NODE_ENV = "production";
    process.env.HR_PULSE_SELF_SERVICE_ENABLED = "true";
    process.env.HR_PULSE_REAL_EMPLOYEE_DATA_ENABLED = "false";
    expect(isSelfServiceEnabled()).toBe(false);
    process.env.HR_PULSE_REAL_EMPLOYEE_DATA_ENABLED = "true";
    expect(isSelfServiceEnabled()).toBe(true);
  });

  it("allows only named failure points outside production", () => {
    process.env.NODE_ENV = "test";
    process.env.HR_PULSE_SELF_SERVICE_TEST_FAILURE = "home.timecard";
    expect(() => assertSelfServiceTestFailure("home.timecard")).toThrowError(new SelfServiceError("SELF_SERVICE_UNAVAILABLE"));
    process.env.NODE_ENV = "production";
    expect(() => assertSelfServiceTestFailure("home.timecard")).not.toThrow();
  });

  it("injects a signing failure only for nonproduction test runs", () => {
    process.env.NODE_ENV = "test";
    process.env.HR_PULSE_SELF_SERVICE_TEST_FAILURE = "download.signing";
    expect(() => assertSelfServiceTestFailure("download.signing")).toThrowError(new SelfServiceError("SELF_SERVICE_UNAVAILABLE"));
    process.env.NODE_ENV = "production";
    expect(() => assertSelfServiceTestFailure("download.signing")).not.toThrow();
  });
});
