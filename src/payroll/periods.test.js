import { describe, expect, it } from "vitest";
import { getNextPeriod, getOrganizationLocalDate, getPeriodContaining, isClosedPeriod, nextDate } from "./periods";

describe("payroll periods", () => {
  it("derives anchored weekly and biweekly periods", () => {
    expect(getPeriodContaining({ frequency: "weekly", anchorStartDate: "2026-08-03" }, "2026-08-12")).toEqual({ periodStart: "2026-08-10", periodEnd: "2026-08-16" });
    expect(getPeriodContaining({ frequency: "biweekly", anchorStartDate: "2026-08-03" }, "2026-08-20")).toEqual({ periodStart: "2026-08-17", periodEnd: "2026-08-30" });
  });

  it("derives semimonthly and monthly periods", () => {
    expect(getPeriodContaining({ frequency: "semimonthly" }, "2026-02-20")).toEqual({ periodStart: "2026-02-16", periodEnd: "2026-02-28" });
    expect(getPeriodContaining({ frequency: "monthly" }, "2024-02-20")).toEqual({ periodStart: "2024-02-01", periodEnd: "2024-02-29" });
  });

  it("chooses the most recently closed first period and then advances", () => {
    const schedule = { frequency: "semimonthly", effectiveStartDate: "2026-01-01" };
    expect(getNextPeriod(schedule, null, "2026-08-26")).toEqual({ periodStart: "2026-08-01", periodEnd: "2026-08-15" });
    expect(getNextPeriod(schedule, "2026-08-15", "2026-09-01")).toEqual({ periodStart: "2026-08-16", periodEnd: "2026-08-31" });
  });

  it("rejects a schedule that has not reached its first closed period", () => {
    expect(() => getNextPeriod({ frequency: "monthly", effectiveStartDate: "2026-09-01" }, null, "2026-08-26")).toThrow("no closed payroll period");
  });

  it("uses the organization timezone for the local date", () => {
    expect(getOrganizationLocalDate("Asia/Manila", new Date("2026-08-25T16:30:00.000Z"))).toBe("2026-08-26");
    expect(getOrganizationLocalDate("America/Los_Angeles", new Date("2026-08-26T02:00:00.000Z"))).toBe("2026-08-25");
  });

  it("rejects missing anchors and unsupported frequencies, covers: AC-3", () => {
    expect(() => getPeriodContaining({ frequency: "weekly" }, "2026-08-12")).toThrow("anchorStartDate is required");
    expect(() => getPeriodContaining({ frequency: "quarterly" }, "2026-08-12")).toThrow("unsupported payroll frequency");
  });

  it("rejects an effective start inside a period, covers: AC-3", () => {
    expect(() => getNextPeriod({ frequency: "monthly", effectiveStartDate: "2026-08-10" }, null, "2026-09-10"))
      .toThrow("schedule effective start must align with a period boundary");
  });

  it("uses inclusive period boundaries, covers: AC-2 and AC-3", () => {
    expect(isClosedPeriod({ periodEnd: "2026-08-15" }, "2026-08-16")).toBe(true);
    expect(isClosedPeriod({ periodEnd: "2026-08-16" }, "2026-08-16")).toBe(false);
    expect(nextDate("2024-02-29")).toBe("2024-03-01");
  });
});
