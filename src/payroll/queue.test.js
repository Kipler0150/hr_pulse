import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  send: vi.fn(),
  updates: [],
}));

vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));
vi.mock("@/inngest/client", () => ({ inngest: { send: mocks.send } }));
vi.mock("@/db", () => ({
  getDb: () => ({
    update: () => ({
      set: (values) => {
        mocks.updates.push(values);
        return { where: vi.fn().mockResolvedValue([]) };
      },
    }),
  }),
}));

import { PAYROLL_EVENT_NAME, PAYROLL_EVENT_VERSION, payrollEventKey, submitPayrollRun } from "./queue";

describe("payroll queue submission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updates.length = 0;
  });

  it("uses one deterministic event key and records submission, covers: AC-5 and AC-8", async () => {
    mocks.send.mockResolvedValue({ ids: ["event-id"] });

    await expect(submitPayrollRun({ runId: "run-id", organizationId: "organization-id", generation: 2 }))
      .resolves.toEqual({ submitted: true, eventId: "event-id" });

    expect(payrollEventKey("run-id", 2)).toBe("payroll-run/run-id/generation/2");
    expect(mocks.send).toHaveBeenCalledWith({
      id: "payroll-run/run-id/generation/2",
      name: PAYROLL_EVENT_NAME,
      data: { runId: "run-id", organizationId: "organization-id", generation: 2, eventVersion: PAYROLL_EVENT_VERSION },
    });
    expect(mocks.updates[0]).toMatchObject({ queueStatus: "submitted", queueEventId: "event-id", queueErrorCode: null });
  });

  it("keeps a failed delivery resubmittable and reports safe identifiers, covers: AC-5, AC-8, and AC-9", async () => {
    const providerError = new Error("provider request body must stay private");
    mocks.send.mockRejectedValue(providerError);

    await expect(submitPayrollRun({ runId: "run-id", organizationId: "organization-id", generation: 1 }))
      .rejects.toMatchObject({ code: "QUEUE_DELIVERY_FAILED", retryable: true });

    expect(mocks.updates.at(-1)).toMatchObject({ queueStatus: "failed", queueErrorCode: "QUEUE_DELIVERY_FAILED" });
    expect(mocks.captureException).toHaveBeenCalledWith(providerError, {
      tags: { organizationId: "organization-id", runId: "run-id", code: "QUEUE_DELIVERY_FAILED" },
    });
  });
});
