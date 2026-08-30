import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ captureException: vi.fn(), count: vi.fn(), distribution: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({
  captureException: mocks.captureException,
  metrics: { count: mocks.count, distribution: mocks.distribution },
}));

import { OvertimeError } from "./errors";
import { recordOvertimeMetric, reportOvertimeFailure } from "./telemetry";

describe("overtime telemetry", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("records operation count and duration with safe identifiers", () => {
    recordOvertimeMetric({ operation: "timecard.submit", organizationId: "org-id", entityId: "card-id", code: "TIMECARD_STALE", durationMs: 19 });

    expect(mocks.count).toHaveBeenCalledWith("timecard.submit.count", 1, {
      attributes: { operation: "timecard.submit", organizationId: "org-id", entityId: "card-id", code: "TIMECARD_STALE" },
    });
    expect(mocks.distribution).toHaveBeenCalledWith("timecard.submit.duration_ms", 19, {
      unit: "millisecond",
      attributes: { operation: "timecard.submit", organizationId: "org-id", entityId: "card-id", code: "TIMECARD_STALE" },
    });
  });

  it("records expected failures without exception noise and maps calculation failures", () => {
    reportOvertimeFailure(new OvertimeError("TIMECARD_INVALID_INTERVAL"), { operation: "timecard.prepare", organizationId: "org-id", employeeId: "employee-id", durationMs: 7 });

    expect(mocks.count).toHaveBeenCalledWith("timecard.calculation.count", 1, expect.objectContaining({ attributes: expect.objectContaining({ code: "TIMECARD_INVALID_INTERVAL" }) }));
    expect(mocks.distribution).toHaveBeenCalledWith("timecard.calculation.duration_ms", 7, expect.any(Object));
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it("reports unexpected failures with safe exception tags and matching metrics", () => {
    reportOvertimeFailure(new Error("private name employee@example.test amount 11250"), { operation: "timecard.approve", organizationId: "org-id", timecardId: "card-id", durationMs: 11 });

    expect(mocks.captureException).toHaveBeenCalledWith(expect.objectContaining({ message: "OVERTIME_REQUEST_FAILED" }), {
      tags: { operation: "timecard.approve", code: "OVERTIME_REQUEST_FAILED", organizationId: "org-id", employeeId: "none", timecardId: "card-id" },
    });
    expect(mocks.count).toHaveBeenCalledWith("timecard.approve.count", 1, expect.any(Object));
    expect(mocks.distribution).toHaveBeenCalledWith("timecard.approve.duration_ms", 11, expect.any(Object));
    expect(JSON.stringify(mocks.captureException.mock.calls)).not.toMatch(/private name|employee@example\.test|11250/);
  });
});
