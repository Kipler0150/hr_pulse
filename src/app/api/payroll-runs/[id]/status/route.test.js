import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePayrollAdministrator: vi.fn(),
  getPayrollRunStatus: vi.fn(),
}));

vi.mock("@/payroll/access", () => ({ requirePayrollAdministrator: mocks.requirePayrollAdministrator }));
vi.mock("@/payroll/service", () => ({ getPayrollRunStatus: mocks.getPayrollRunStatus }));

import { PayrollError } from "@/payroll/errors";
import { GET } from "./route";

const runId = "123e4567-e89b-12d3-a456-426614174000";

describe("payroll run status route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the narrow organization scoped polling shape, covers: AC-5, AC-9, and AC-10", async () => {
    mocks.requirePayrollAdministrator.mockResolvedValue({ organizationId: "organization-id" });
    mocks.getPayrollRunStatus.mockResolvedValue({
      run: {
        id: runId,
        status: "completed",
        queueStatus: "submitted",
        updatedAt: new Date("2026-08-26T00:00:00.000Z"),
        lastProgressAt: new Date("2026-08-26T00:00:00.000Z"),
        grossTotalMinor: 500_000,
        deductionsTotalMinor: 50_000,
        netTotalMinor: 450_000,
        currency: "USD",
        currencyExponent: 2,
        errorCode: null,
      },
      attemptCount: 1,
      delayed: false,
      recoveryEligible: null,
    });

    const response = await GET(new Request(`http://localhost/api/payroll-runs/${runId}/status`), { params: Promise.resolve({ id: runId }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: runId,
      status: "completed",
      queueStatus: "submitted",
      updatedAt: "2026-08-26T00:00:00.000Z",
      lastProgressAt: "2026-08-26T00:00:00.000Z",
      totals: { grossAmountMinor: 500_000, deductionsAmountMinor: 50_000, netAmountMinor: 450_000, currency: "USD", currencyExponent: 2 },
      attemptCount: 1,
      delayed: false,
      recoveryEligible: false,
      failure: null,
    });
    expect(mocks.getPayrollRunStatus).toHaveBeenCalledWith("organization-id", runId);
  });

  it("returns catalogue guidance for a failed run, covers: AC-5, AC-8, and AC-10", async () => {
    mocks.requirePayrollAdministrator.mockResolvedValue({ organizationId: "organization-id" });
    mocks.getPayrollRunStatus.mockResolvedValue({
      run: {
        id: runId, status: "failed", queueStatus: "submitted", updatedAt: new Date(0), lastProgressAt: new Date(0),
        grossTotalMinor: 100, deductionsTotalMinor: 10, netTotalMinor: 90, currency: "USD", currencyExponent: 2,
        errorCode: "PAYSLIP_INTEGRITY_FAILED", errorGuidance: "Retry after storage recovery.",
      },
      attemptCount: 4, delayed: false, recoveryEligible: false,
    });

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: runId }) });
    const body = await response.json();

    expect(body.failure).toMatchObject({ code: "PAYSLIP_INTEGRITY_FAILED", guidance: "Retry after storage recovery.", retryable: true });
  });

  it("fails closed for a nonadministrator, covers: AC-9", async () => {
    mocks.requirePayrollAdministrator.mockRejectedValue(new PayrollError("PAYROLL_FORBIDDEN"));

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: runId }) });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "PAYROLL_FORBIDDEN" } });
    expect(mocks.getPayrollRunStatus).not.toHaveBeenCalled();
  });

  it("rejects malformed run identifiers before reading payroll data, covers: AC-9", async () => {
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "not-a-uuid" }) });

    expect(response.status).toBe(422);
    expect(mocks.requirePayrollAdministrator).not.toHaveBeenCalled();
  });
});
