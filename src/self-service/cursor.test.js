import { afterEach, describe, expect, it, vi } from "vitest";

import { SELF_SERVICE_CURSOR_MAX_LENGTH, SELF_SERVICE_CURSOR_TTL_SECONDS, decodeSelfServiceCursor, encodeSelfServiceCursor } from "./cursor";
import { SelfServiceError } from "./errors";

const expected = { organizationId: "organization-id", employeeId: "employee-id", kind: "time", status: "approved" };
const value = { ...expected, periodEnd: "2026-08-31", id: "timecard-id" };

describe("self service cursors", () => {
  const original = { nodeEnv: process.env.NODE_ENV, secret: process.env.HR_PULSE_SELF_SERVICE_CURSOR_SECRET };

  afterEach(() => {
    vi.useRealTimers();
    process.env.NODE_ENV = original.nodeEnv;
    if (original.secret === undefined) delete process.env.HR_PULSE_SELF_SERVICE_CURSOR_SECRET;
    else process.env.HR_PULSE_SELF_SERVICE_CURSOR_SECRET = original.secret;
  });

  it("round trips with a fifteen minute expiry", () => {
    const issuedAt = new Date("2026-09-01T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(issuedAt);

    const cursor = encodeSelfServiceCursor(value);
    expect(decodeSelfServiceCursor(cursor, expected)).toMatchObject(value);

    vi.setSystemTime(new Date(issuedAt.getTime() + (SELF_SERVICE_CURSOR_TTL_SECONDS - 1) * 1000));
    expect(decodeSelfServiceCursor(cursor, expected)).toMatchObject(value);
  });

  it("rejects an expired cursor as invalid", () => {
    const issuedAt = new Date("2026-09-01T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(issuedAt);
    const cursor = encodeSelfServiceCursor(value);

    vi.setSystemTime(new Date(issuedAt.getTime() + SELF_SERVICE_CURSOR_TTL_SECONDS * 1000));
    expect(() => decodeSelfServiceCursor(cursor, expected)).toThrowError(new SelfServiceError("SELF_SERVICE_INVALID_CURSOR"));
  });

  it("rejects an overlong cursor before verification", () => {
    expect(() => decodeSelfServiceCursor("x".repeat(SELF_SERVICE_CURSOR_MAX_LENGTH + 1), expected)).toThrowError(new SelfServiceError("SELF_SERVICE_INVALID_CURSOR"));
  });

  it("fails closed in production when the cursor secret is missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.HR_PULSE_SELF_SERVICE_CURSOR_SECRET;
    expect(() => encodeSelfServiceCursor(value)).toThrowError(new SelfServiceError("SELF_SERVICE_UNAVAILABLE"));
  });
});
