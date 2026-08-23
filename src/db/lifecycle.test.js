import { describe, expect, it } from "vitest";
import { assertMutable, assertTransition, getTransitions } from "./lifecycle";

describe("core lifecycle guards", () => {
  it("allows only the transitions from the data model decision", () => {
    expect(assertTransition("employee", "active", "inactive")).toBe("inactive");
    expect(assertTransition("payroll", "failed", "processing")).toBe("processing");
    expect(assertTransition("payout", "processing", "paid")).toBe("paid");
    expect(() => assertTransition("employee", "terminated", "active")).toThrow();
    expect(() => assertTransition("leave", "draft", "approved")).toThrow();
  });

  it("rejects normal mutation of terminal records", () => {
    expect(assertMutable("employee", "active")).toBe(true);
    expect(() => assertMutable("employee", "terminated")).toThrow();
    expect(() => assertMutable("payroll", "completed")).toThrow();
    expect(() => assertMutable("payslip", "generated")).toThrow();
  });

  it("returns an isolated transition map", () => {
    const stateMap = getTransitions("attendance");
    stateMap.open.push("cancelled");
    expect(getTransitions("attendance").open).toEqual(["completed"]);
  });
});
