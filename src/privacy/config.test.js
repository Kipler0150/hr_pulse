import { afterEach, describe, expect, it, vi } from "vitest";

import { getPrivacyAnalyticsSecret, isPrivacyEnabled } from "./config";

describe("privacy configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("requires the literal true flag", () => {
    vi.stubEnv("HR_PULSE_PRIVACY_ENABLED", "true");
    expect(isPrivacyEnabled()).toBe(true);
    vi.stubEnv("HR_PULSE_PRIVACY_ENABLED", "1");
    expect(isPrivacyEnabled()).toBe(false);
  });

  it("requires a configured analytics secret in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HR_PULSE_PRIVACY_ANALYTICS_SECRET", "");
    expect(() => getPrivacyAnalyticsSecret()).toThrow("HR_PULSE_PRIVACY_ANALYTICS_SECRET is required");
  });
});
