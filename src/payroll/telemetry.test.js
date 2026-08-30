import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ count: vi.fn(), distribution: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({ metrics: { count: mocks.count, distribution: mocks.distribution } }));

import { recordPayrollMetric } from "./telemetry";

describe("payroll telemetry", () => {
  beforeEach(() => vi.resetAllMocks());

  it("records safe blocked preview count and duration metrics, covers: AC-11", () => {
    recordPayrollMetric({ operation: "payroll.preview.blocked", organizationId: "organization-id", entityId: "organization-id", code: "TIMECARD_APPROVAL_MISSING", durationMs: 12 });

    expect(mocks.count).toHaveBeenCalledWith("payroll.preview.blocked.count", 1, {
      attributes: { operation: "payroll.preview.blocked", organizationId: "organization-id", entityId: "organization-id", code: "TIMECARD_APPROVAL_MISSING" },
    });
    expect(mocks.distribution).toHaveBeenCalledWith("payroll.preview.blocked.duration_ms", 12, {
      unit: "millisecond",
      attributes: { operation: "payroll.preview.blocked", organizationId: "organization-id", entityId: "organization-id", code: "TIMECARD_APPROVAL_MISSING" },
    });
    expect(JSON.stringify(mocks.count.mock.calls)).not.toMatch(/name|email|timestamp|amount|rate|note/i);
  });

  it("normalizes missing identifiers and negative durations without exposing details, covers: AC-11", () => {
    recordPayrollMetric({ operation: "payroll.preview.blocked", durationMs: -4 });

    expect(mocks.count).toHaveBeenCalledWith("payroll.preview.blocked.count", 1, {
      attributes: { operation: "payroll.preview.blocked", organizationId: "unknown", entityId: "none", code: "none" },
    });
    expect(mocks.distribution).toHaveBeenCalledWith("payroll.preview.blocked.duration_ms", 0, {
      unit: "millisecond",
      attributes: { operation: "payroll.preview.blocked", organizationId: "unknown", entityId: "none", code: "none" },
    });
  });

  it("emits an application log with only safe metric dimensions, covers: AC-11", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    recordPayrollMetric({ operation: "payroll.confirm", organizationId: "organization-id", entityId: "run-id", code: "PREVIEW_STALE", durationMs: 8 });

    expect(info).toHaveBeenCalledWith("[payroll.metric]", {
      operation: "payroll.confirm",
      organizationId: "organization-id",
      entityId: "run-id",
      code: "PREVIEW_STALE",
      count: 1,
      durationMs: 8,
    });
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/name|email|timestamp|amount|rate|note|token/i);
    info.mockRestore();
  });
});
