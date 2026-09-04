import { afterEach, describe, expect, it, vi } from "vitest";
import { operationFailureGroupKey, productEventDedupeKey, recordOperationFailure, recordProductEvent } from "./writers";
import { serializeSafeAuditMetadata } from "@/lib/audit";

describe("operational privacy and grouping", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("omits consent-controlled telemetry without an attributable profile", async () => {
    vi.stubEnv("HR_PULSE_PRIVACY_ENABLED", "true");
    const db = { insert: vi.fn(), select: vi.fn() };
    const organizationId = "123e4567-e89b-42d3-a456-426614174000";
    await expect(recordProductEvent({ db, organizationId, eventName: "payroll.completed", occurrenceIdentity: "privacy-test" })).resolves.toBeNull();
    await expect(recordOperationFailure({ db, organizationId, operation: "payroll.calculation", safeCode: "PAYROLL_PROCESSING_FAILED" })).resolves.toBeNull();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("fails closed when privacy controls are disabled", async () => {
    vi.stubEnv("HR_PULSE_PRIVACY_ENABLED", "false");
    const db = { insert: vi.fn(), select: vi.fn() };
    const organizationId = "123e4567-e89b-42d3-a456-426614174000";
    const profileId = "223e4567-e89b-42d3-a456-426614174000";

    await expect(recordProductEvent({ db, organizationId, eventName: "payroll.completed", occurrenceIdentity: "privacy-disabled", analyticsProfileId: profileId })).resolves.toBeNull();
    await expect(recordOperationFailure({ db, organizationId, operation: "payroll.calculation", safeCode: "PAYROLL_PROCESSING_FAILED", analyticsProfileId: profileId })).resolves.toBeNull();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("stores only reviewed audit metadata fields", () => {
    expect(serializeSafeAuditMetadata({ version: 3, changedFields: ["phone", "email", "email"], errorCode: "PAYROLL_FAILED", grossAmountMinor: 500 })).toEqual({
      resultingVersion: 3,
      changedFields: ["phone", "email"],
      reasonCodes: ["PAYROLL_FAILED"],
    });
  });

  it("deduplicates the same occurrence and groups failures without correlation or status", () => {
    expect(productEventDedupeKey("payroll.completed", "run-1:completed")).toBe(productEventDedupeKey("payroll.completed", "run-1:completed"));
    const first = operationFailureGroupKey({ organizationId: "org", operation: "payroll.calculation", safeCode: "PAYROLL_PROCESSING_FAILED", affectedEntityType: "payroll_run", affectedEntityId: "run", workflowArea: "payroll" });
    const second = operationFailureGroupKey({ organizationId: "org", operation: "payroll.calculation", safeCode: "PAYROLL_PROCESSING_FAILED", affectedEntityType: "payroll_run", affectedEntityId: "run", workflowArea: "payroll" });
    expect(first).toBe(second);
  });
});
