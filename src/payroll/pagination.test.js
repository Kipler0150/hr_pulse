import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, PAYROLL_PAGE_SIZE } from "./pagination";

describe("payroll cursors", () => {
  it("round trips compound cursor values, covers: AC-10", () => {
    const values = { createdAt: "2026-08-26T00:00:00.000Z", id: "run-id" };
    expect(decodeCursor(encodeCursor(values), ["createdAt", "id"])).toEqual(values);
    expect(PAYROLL_PAGE_SIZE).toBe(50);
  });

  it("rejects malformed and incomplete cursors without throwing, covers: AC-10", () => {
    expect(decodeCursor("not-json", ["createdAt", "id"])).toBeNull();
    expect(decodeCursor(encodeCursor({ id: "run-id" }), ["createdAt", "id"])).toBeNull();
    expect(decodeCursor(encodeCursor({ createdAt: "", id: "run-id" }), ["createdAt", "id"])).toBeNull();
  });

  it("rejects absent and nonstring cursors, covers: AC-10", () => {
    expect(decodeCursor(null, ["id"])).toBeNull();
    expect(decodeCursor(42, ["id"])).toBeNull();
  });
});
