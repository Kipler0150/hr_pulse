import { describe, expect, it } from "vitest";
import { createCorrelationId, ensureCorrelationId } from "./correlation";

describe("operation correlation identifiers", () => {
  it("creates a UUID correlation identifier, covers AC-3 and AC-8", () => {
    expect(createCorrelationId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("preserves a valid caller correlation identifier, covers AC-3 and AC-10", () => {
    const value = "123e4567-e89b-42d3-a456-426614174000";
    expect(ensureCorrelationId(value)).toBe(value);
  });

  it("rejects a malformed caller correlation identifier, covers AC-3", () => {
    expect(() => ensureCorrelationId("not-a-uuid")).toThrow("correlationId must be a valid UUID");
  });
});
