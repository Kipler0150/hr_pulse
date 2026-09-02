import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mocks = vi.hoisted(() => ({ captureException: vi.fn(), count: vi.fn(), distribution: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException, metrics: { count: mocks.count, distribution: mocks.distribution } }));

import { recordSelfServiceMetric, reportSelfServiceFailure } from "./telemetry";

describe("self service telemetry", () => {
  beforeEach(() => { mocks.captureException.mockReset(); mocks.count.mockReset(); mocks.distribution.mockReset(); });

  it("records safe dimensions and does not capture expected validation failures", () => {
    reportSelfServiceFailure(new Error("private employee@example.test amount 12000"), { operation: "self_service.profile.update", organizationId: "org-id", employeeId: "employee-id", durationMs: 4 });
    expect(mocks.count).toHaveBeenCalledWith("self_service.profile.update.count", 1, expect.objectContaining({ attributes: expect.objectContaining({ organizationId: "org-id", employeeId: "employee-id", result: "unexpected_error", retryOutcome: "not_applicable", code: "SELF_SERVICE_UNAVAILABLE" }) }));
    expect(mocks.captureException).toHaveBeenCalledWith(expect.objectContaining({ message: "SELF_SERVICE_UNAVAILABLE" }), { tags: { operation: "self_service.profile.update", code: "SELF_SERVICE_UNAVAILABLE" } });
    expect(JSON.stringify(mocks.captureException.mock.calls)).not.toMatch(/private employee|12000/);
  });

  it("records the allowlisted success and retry dimensions", () => {
    recordSelfServiceMetric({ operation: "self_service.profile.update", organizationId: "org-id", employeeId: "employee-id", result: "success", retryOutcome: "replayed" });
    expect(mocks.count).toHaveBeenCalledWith("self_service.profile.update.count", 1, expect.objectContaining({ attributes: { operation: "self_service.profile.update", result: "success", retryOutcome: "replayed", organizationId: "org-id", employeeId: "employee-id", code: "none" } }));
  });

  it("maps unknown operation names to the safe home operation", () => {
    recordSelfServiceMetric({ operation: "self_service.profile_update", organizationId: "org-id" });
    expect(mocks.count).toHaveBeenCalledWith("self_service.home.count", 1, expect.objectContaining({ attributes: expect.objectContaining({ operation: "self_service.home" }) }));
  });

  it("maps arbitrary metric codes to the safe unavailable code", () => {
    recordSelfServiceMetric({ operation: "self_service.profile.update", organizationId: "org-id", code: "employee@example.test /payslips/123" });
    expect(mocks.count).toHaveBeenCalledWith("self_service.profile.update.count", 1, expect.objectContaining({ attributes: expect.objectContaining({ code: "SELF_SERVICE_UNAVAILABLE" }) }));
    expect(JSON.stringify(mocks.count.mock.calls)).not.toMatch(/employee@example\.test|payslips/);
  });

  it("writes only sanitized metrics and exception tags to the local test sink", () => {
    const directory = mkdtempSync(join(tmpdir(), "hr-pulse-telemetry-"));
    const sink = join(directory, "events.jsonl");
    const originalMode = process.env.HR_PULSE_SELF_SERVICE_TELEMETRY_SINK_MODE;
    const originalSink = process.env.HR_PULSE_SELF_SERVICE_TELEMETRY_SINK;
    process.env.HR_PULSE_SELF_SERVICE_TELEMETRY_SINK_MODE = "test";
    process.env.HR_PULSE_SELF_SERVICE_TELEMETRY_SINK = sink;
    try {
      reportSelfServiceFailure(new Error("employee@example.test paid 12000"), { operation: "self_service.payslip.download", organizationId: "org-id", employeeId: "employee-id", durationMs: 7 });
      const events = readFileSync(sink, "utf8").trim().split("\n").map((line) => JSON.parse(line));
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "metric", name: "self_service.payslip.download.count", attributes: expect.objectContaining({ operation: "self_service.payslip.download", organizationId: "org-id", employeeId: "employee-id", code: "SELF_SERVICE_UNAVAILABLE" }) }),
        expect.objectContaining({ type: "exception", message: "SELF_SERVICE_UNAVAILABLE", tags: { operation: "self_service.payslip.download", code: "SELF_SERVICE_UNAVAILABLE" } }),
      ]));
      expect(readFileSync(sink, "utf8")).not.toMatch(/employee@example\.test|12000|paid/);
    } finally {
      if (originalMode === undefined) delete process.env.HR_PULSE_SELF_SERVICE_TELEMETRY_SINK_MODE; else process.env.HR_PULSE_SELF_SERVICE_TELEMETRY_SINK_MODE = originalMode;
      if (originalSink === undefined) delete process.env.HR_PULSE_SELF_SERVICE_TELEMETRY_SINK; else process.env.HR_PULSE_SELF_SERVICE_TELEMETRY_SINK = originalSink;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
