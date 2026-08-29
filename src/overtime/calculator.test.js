import { describe, expect, it } from "vitest";

import { allocateDailyOvertimeMoney, calculateOvertimeAmount, calculateTimecard } from "./calculator";

const pay = { dailyThresholdMinutes: 480, policyEnabled: true, overtimeEligible: true, baseGrossAmountMinor: 100_000, standardPeriodMinutes: 9_600, multiplierBasisPoints: 15_000, currency: "PHP" };

describe("overtime calculator", () => {
  it("splits an overnight interval at supplied local day boundaries", () => {
    const result = calculateTimecard({
      ...pay,
      days: [
        { localDate: "2026-08-01", utcStart: "2026-07-31T16:00:00Z", utcEnd: "2026-08-01T16:00:00Z" },
        { localDate: "2026-08-02", utcStart: "2026-08-01T16:00:00Z", utcEnd: "2026-08-02T16:00:00Z" },
      ],
      intervals: [{ id: "one", clockIn: "2026-08-01T15:00:00Z", clockOut: "2026-08-01T17:00:00Z" }],
    });
    expect(result.days.map((day) => day.workedSeconds)).toEqual([3600, 3600]);
    expect(result.days.flatMap((day) => day.sources).map((source) => source.allocatedSeconds)).toEqual([3600, 3600]);
  });

  it("supports 23 and 25 hour local day boundaries without assuming a fixed day", () => {
    const short = calculateTimecard({ ...pay, dailyThresholdMinutes: 1440, days: [{ localDate: "2026-03-08", utcStart: "2026-03-08T05:00:00Z", utcEnd: "2026-03-09T04:00:00Z" }], intervals: [{ id: "short", clockIn: "2026-03-08T05:00:00Z", clockOut: "2026-03-09T04:00:00Z" }] });
    const long = calculateTimecard({ ...pay, dailyThresholdMinutes: 1440, days: [{ localDate: "2026-11-01", utcStart: "2026-11-01T04:00:00Z", utcEnd: "2026-11-02T05:00:00Z" }], intervals: [{ id: "long", clockIn: "2026-11-01T04:00:00Z", clockOut: "2026-11-02T04:00:00Z" }] });
    expect(short.workedSeconds).toBe(23 * 3600);
    expect(long.workedSeconds).toBe(24 * 3600);
  });

  it("rounds payable overtime to the nearest minute with 30 seconds up", () => {
    const result = calculateTimecard({ ...pay, dailyThresholdMinutes: 1, days: [{ localDate: "2026-08-01", utcStart: "2026-08-01T00:00:00Z", utcEnd: "2026-08-02T00:00:00Z" }], intervals: [{ id: "one", clockIn: "2026-08-01T00:00:00Z", clockOut: "2026-08-01T00:01:30Z" }] });
    expect(result.overtimeSeconds).toBe(30);
    expect(result.payableOvertimeMinutes).toBe(1);
  });

  it("rounds the period amount once using exact integer arithmetic", () => {
    expect(calculateOvertimeAmount({ baseGrossAmountMinor: 100_001, payableOvertimeMinutes: 61, multiplierBasisPoints: 15_000, standardPeriodMinutes: 9_600 })).toBe(953);
  });

  it("allocates rounded money by largest remainder and date order", () => {
    const rows = allocateDailyOvertimeMoney({ baseGrossAmountMinor: 100, multiplierBasisPoints: 10_000, standardPeriodMinutes: 3, periodAmountMinor: 67, days: [{ localDate: "2026-01-01", payableOvertimeMinutes: 1 }, { localDate: "2026-01-02", payableOvertimeMinutes: 1 }] });
    expect(rows.map((day) => day.overtimeAmountMinor)).toEqual([34, 33]);
  });

  it("preserves worked time with zero overtime when disabled or ineligible", () => {
    const result = calculateTimecard({ ...pay, policyEnabled: false, overtimeEligible: true, days: [{ localDate: "2026-08-01", utcStart: "2026-08-01T00:00:00Z", utcEnd: "2026-08-02T00:00:00Z" }], intervals: [{ id: "one", clockIn: "2026-08-01T00:00:00Z", clockOut: "2026-08-01T10:00:00Z" }] });
    expect(result).toMatchObject({ workedSeconds: 36_000, regularSeconds: 36_000, overtimeSeconds: 0, overtimeAmountMinor: 0 });
  });

  it("rejects overlapping and longer than 24 hour intervals", () => {
    const days = [{ localDate: "2026-08-01", utcStart: "2026-08-01T00:00:00Z", utcEnd: "2026-08-02T00:00:00Z" }, { localDate: "2026-08-02", utcStart: "2026-08-02T00:00:00Z", utcEnd: "2026-08-03T00:00:00Z" }];
    expect(() => calculateTimecard({ ...pay, days, intervals: [{ id: "one", clockIn: "2026-08-01T00:00:00Z", clockOut: "2026-08-02T00:00:01Z" }] })).toThrow("24 hours");
    expect(() => calculateTimecard({ ...pay, days, intervals: [{ id: "one", clockIn: "2026-08-01T00:00:00Z", clockOut: "2026-08-01T02:00:00Z" }, { id: "two", clockIn: "2026-08-01T01:00:00Z", clockOut: "2026-08-01T03:00:00Z" }] })).toThrow("overlap");
  });
});
