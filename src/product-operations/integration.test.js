import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  recordProductEvent: vi.fn(),
  recordOperationFailure: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));
vi.mock("./writers", () => ({ recordProductEvent: mocks.recordProductEvent, recordOperationFailure: mocks.recordOperationFailure }));

import { recordFailureSummary, recordProductMilestone } from "./integration";

describe("product operations integration", () => {
  beforeEach(() => {
    process.env.HR_PULSE_PRODUCT_OPERATIONS_ENABLED = "true";
    vi.resetAllMocks();
  });

  it("keeps a Sentry delivery failure from escaping a product milestone write boundary", async () => {
    mocks.recordProductEvent.mockRejectedValue(new Error("database unavailable"));
    mocks.captureException.mockImplementation(() => { throw new Error("Sentry delivery unavailable"); });

    await expect(recordProductMilestone({
      organizationId: "123e4567-e89b-42d3-a456-426614174000",
      eventName: "setup.organization_completed",
      workflowArea: "setup",
      resultCategory: "success",
      occurrenceIdentity: "sentry-delivery-milestone",
    })).resolves.toBeNull();
  });

  it("keeps a Sentry delivery failure from escaping a failure summary write boundary", async () => {
    mocks.recordOperationFailure.mockRejectedValue(new Error("database unavailable"));
    mocks.captureException.mockImplementation(() => { throw new Error("Sentry delivery unavailable"); });

    await expect(recordFailureSummary({
      organizationId: "123e4567-e89b-42d3-a456-426614174000",
      operation: "payroll.calculation",
      safeCode: "PAYROLL_PROCESSING_FAILED",
    })).resolves.toBeNull();
  });
});
