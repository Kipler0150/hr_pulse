import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  metrics: { count: vi.fn(), distribution: vi.fn() },
}));

vi.mock("@sentry/nextjs", () => sentry);

import { reportTimeOffFailure } from "./telemetry";

describe("time off telemetry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records only safe identifiers and retry fields in metrics, covers AC-10 and AC-12", async () => {
    reportTimeOffFailure(new Error("private database note"), { operation: "time_off.submit", organizationId: "organization-id", requestId: "request-id", durationMs: 12, retryOutcome: "conflict" });

    expect(sentry.metrics.count).toHaveBeenCalledWith("time_off.submit.count", 1, { attributes: { operation: "time_off.submit", organizationId: "organization-id", requestId: "request-id", code: "TIME_OFF_REQUEST_FAILED", retryOutcome: "conflict" } });
    expect(JSON.stringify(sentry.metrics.count.mock.calls)).not.toContain("private database note");
  });

  it("captures an unexpected failure with a generic error and no provider detail, covers AC-10 and AC-12", () => {
    reportTimeOffFailure(new Error("private database note"), { operation: "time_off.submit", organizationId: "organization-id", requestId: "request-id" });

    expect(sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "TIME_OFF_REQUEST_FAILED" }),
      expect.objectContaining({ tags: { operation: "time_off.submit", code: "TIME_OFF_REQUEST_FAILED", organizationId: "organization-id", requestId: "request-id" } }),
    );
    expect(JSON.stringify(sentry.captureException.mock.calls)).not.toContain("private database note");
  });
});
