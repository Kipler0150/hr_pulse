import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  requireProductOperationsContext: vi.fn(),
}));

vi.mock("@/db", () => ({ getDb: mocks.getDb }));
vi.mock("./access", () => ({ requireProductOperationsContext: mocks.requireProductOperationsContext }));

import { getOperationsSummary } from "./queries";

describe("product operations summaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("HR_PULSE_PRODUCT_OPERATIONS_ENABLED", "true");
    mocks.requireProductOperationsContext.mockResolvedValue({
      organizationId: "123e4567-e89b-42d3-a456-426614174000",
      organization: { timezone: "UTC" },
    });
  });

  it("rejects unsupported summary windows before reading the database, covers AC-7", async () => {
    await expect(getOperationsSummary("90d")).rejects.toMatchObject({ code: "AUDIT_FILTER_INVALID" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("keeps every metric group unavailable when the database read fails, covers AC-7 and AC-12", async () => {
    mocks.getDb.mockReturnValue({
      select: vi.fn(() => {
        throw new Error("private database message");
      }),
    });

    const summary = await getOperationsSummary("7d");

    expect(summary.partial).toBe(true);
    expect(summary.adoption).toMatchObject({ state: "unavailable", total: null });
    expect(summary.workflowHealth).toMatchObject({ state: "unavailable", areas: [] });
    expect(summary.latency).toMatchObject({ state: "unavailable", rows: [] });
    expect(summary.queue).toMatchObject({ state: "unavailable", queued: null });
    expect(summary.failures).toMatchObject({ state: "unavailable", rows: [] });
    expect(summary.unexpectedErrors).toMatchObject({ state: "unavailable", count: null });
  });
});
