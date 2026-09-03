import { beforeEach, describe, expect, it, vi } from "vitest";
import { signAuditCursor, verifyAuditCursor } from "./cursor";

const organizationId = "123e4567-e89b-12d3-a456-426614174000";
const eventId = "123e4567-e89b-12d3-a456-426614174001";

describe("audit cursors", () => {
  beforeEach(() => {
    vi.stubEnv("HR_PULSE_PRODUCT_OPERATIONS_CURSOR_SECRET", "a".repeat(32));
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T00:00:00.000Z"));
  });

  it("signs a cursor to its organization and filters", () => {
    const filters = { from: "2026-08-01", to: "2026-08-30", actorProfileId: null, action: null, entityType: null, result: null };
    const cursor = signAuditCursor({ organizationId, filters, createdAt: new Date("2026-08-15T00:00:00.000Z"), id: eventId });
    expect(verifyAuditCursor(cursor, { organizationId, filters })).toMatchObject({ id: eventId, createdAt: new Date("2026-08-15T00:00:00.000Z") });
    expect(() => verifyAuditCursor(cursor, { organizationId, filters: { ...filters, result: "success" } })).toThrow("expired or is invalid");
  });

  it("rejects tampering and expiry", () => {
    const filters = { from: "2026-08-01", to: "2026-08-30", actorProfileId: null, action: null, entityType: null, result: null };
    const cursor = signAuditCursor({ organizationId, filters, createdAt: new Date("2026-08-15T00:00:00.000Z"), id: eventId, expiresAt: new Date("2026-09-02T00:00:00.000Z") });
    expect(() => verifyAuditCursor(`${cursor}changed`, { organizationId, filters })).toThrow("expired or is invalid");
  });
});
