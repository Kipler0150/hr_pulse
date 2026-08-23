import { describe, expect, it } from "vitest";
import { getRecoveryError } from "./recovery";

describe("recovery callback errors", () => {
  it("returns a safe recovery message for an expired link", () => {
    expect(getRecoveryError("otp_expired")).toEqual({
      error: "This recovery link is invalid or has expired. Request a new link to continue.",
    });
  });

  it("does not expose provider details for unknown callback errors", () => {
    expect(getRecoveryError("unexpected_provider_error")).toBeNull();
  });
});