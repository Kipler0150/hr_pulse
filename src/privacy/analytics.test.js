import { afterEach, describe, expect, it, vi } from "vitest";

import { analyticsSubjectKey } from "./analytics";
import { runPrivacyRetention } from "./retention";

const organizationId = "123e4567-e89b-42d3-a456-426614174000";
const profileId = "223e4567-e89b-42d3-a456-426614174000";

describe("privacy analytics boundaries", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("derives a stable organization-scoped pseudonymous subject key", () => {
    vi.stubEnv("HR_PULSE_PRIVACY_ANALYTICS_SECRET", "a".repeat(32));
    const key = analyticsSubjectKey({ organizationId, profileId });
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).toBe(analyticsSubjectKey({ organizationId, profileId }));
    expect(key).not.toContain(profileId);
    expect(key).not.toBe(analyticsSubjectKey({ organizationId: "323e4567-e89b-42d3-a456-426614174000", profileId }));
  });

  it("does not run retention while the privacy feature is disabled", async () => {
    vi.stubEnv("HR_PULSE_PRIVACY_ENABLED", "false");
    await expect(runPrivacyRetention({ db: null })).resolves.toEqual({ status: "disabled" });
  });
});
