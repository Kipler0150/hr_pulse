import { afterEach, describe, expect, it, vi } from "vitest";

import { assertTimeOffEnabled, isTimeOffEnabled, TimeOffError } from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("time off release control", () => {
  it("enables the feature only for the explicit true value, covers AC-12", () => {
    vi.stubEnv("HR_PULSE_TIME_OFF_ENABLED", "true");
    expect(isTimeOffEnabled()).toBe(true);

    vi.stubEnv("HR_PULSE_TIME_OFF_ENABLED", "false");
    expect(isTimeOffEnabled()).toBe(false);
  });

  it("defaults to disabled in production, covers AC-12", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HR_PULSE_TIME_OFF_ENABLED", "");

    expect(isTimeOffEnabled()).toBe(false);
  });

  it("raises the catalogued disabled error when a route or action is blocked, covers AC-12", () => {
    vi.stubEnv("HR_PULSE_TIME_OFF_ENABLED", "false");

    expect(() => assertTimeOffEnabled()).toThrow(new TimeOffError("TIME_OFF_DISABLED"));
  });
});
