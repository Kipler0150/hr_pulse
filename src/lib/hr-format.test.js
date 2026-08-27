import { describe, expect, it } from "vitest";

import { formatDateOnly, formatDateRange, formatInstant, formatMoney, formatRole } from "@/lib/hr-format";

describe("HR value formatting", () => {
  it("formats positive, negative, and zero minor units using ISO currency digits, covers: AC-6", () => {
    expect(formatMoney(123456, "PHP")).toContain("1,234.56");
    expect(formatMoney(-500, "USD")).toMatch(/-.*5\.00/);
    expect(formatMoney(0, "JPY")).toContain("0");
  });

  it("returns an em dash for missing or invalid money, covers: AC-6", () => {
    expect(formatMoney(null, "PHP")).toBe("—");
    expect(formatMoney(12.5, "PHP")).toBe("—");
    expect(formatMoney(100, "not-a-currency")).toBe("—");
  });

  it("keeps a date only value on its calendar day, covers: AC-6", () => {
    expect(formatDateOnly("2026-08-25")).toMatch(/Aug.*25.*2026/);
  });

  it("rejects impossible and malformed date only values, covers: AC-6", () => {
    expect(formatDateOnly("2026-02-30")).toBe("—");
    expect(formatDateOnly("25-08-2026")).toBe("—");
  });

  it("formats instants in the organization timezone, covers: AC-6", () => {
    expect(formatInstant("2026-08-25T23:30:00Z", "Asia/Manila")).toMatch(/Aug.*26.*2026/);
  });

  it("returns an em dash for invalid instants or timezones, covers: AC-6", () => {
    expect(formatInstant("invalid", "Asia/Manila")).toBe("—");
    expect(formatInstant("2026-08-25T00:00:00Z", "Mars/Olympus")).toBe("—");
  });

  it("formats valid leave ranges and rejects invalid endpoints, covers: AC-6", () => {
    expect(formatDateRange("2026-09-01", "2026-09-03")).toMatch(/Sep.*1.*2026 to Sep.*3.*2026/);
    expect(formatDateRange("invalid", "2026-09-03")).toBe("—");
  });

  it("turns stored role enums into calm display labels, covers: AC-3", () => {
    expect(formatRole("payroll_administrator")).toBe("Payroll Administrator");
    expect(formatRole(null)).toBe("Member");
  });
});
