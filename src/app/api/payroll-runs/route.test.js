import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePayrollAdministrator: vi.fn(),
  listPayrollRuns: vi.fn(),
}));
vi.mock("@/payroll/access", () => ({ requirePayrollAdministrator: mocks.requirePayrollAdministrator }));
vi.mock("@/payroll/service", () => ({ listPayrollRuns: mocks.listPayrollRuns }));

import { PayrollError } from "@/payroll/errors";
import { GET } from "./route";

describe("payroll run list route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the paginated service result without exposing snapshot details, covers: AC-9 and AC-10", async () => {
    const run = {
      id: "run-id", periodStart: "2026-07-01", periodEnd: "2026-07-31", status: "completed", currency: "USD",
      grossTotalMinor: 500_000, deductionsTotalMinor: 50_000, netTotalMinor: 450_000, updatedAt: new Date("2026-08-26T00:00:00.000Z"),
    };
    mocks.requirePayrollAdministrator.mockResolvedValue({ organizationId: "organization-id" });
    mocks.listPayrollRuns.mockResolvedValue({ rows: [run], nextCursor: "next-cursor" });

    const response = await GET(new Request("http://localhost/api/payroll-runs"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [{ ...run, updatedAt: "2026-08-26T00:00:00.000Z" }],
      nextCursor: "next-cursor",
    });
  });

  it("fails closed for a nonadministrator, covers: AC-9", async () => {
    mocks.requirePayrollAdministrator.mockRejectedValue(new PayrollError("PAYROLL_FORBIDDEN"));

    const response = await GET(new Request("http://localhost/api/payroll-runs"));

    expect(response.status).toBe(403);
    expect(mocks.listPayrollRuns).not.toHaveBeenCalled();
  });
});
