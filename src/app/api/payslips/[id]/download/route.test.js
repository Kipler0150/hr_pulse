import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  requirePayrollAdministrator: vi.fn(),
  verifyPayslipObject: vi.fn(),
  createPayslipDownloadUrl: vi.fn(),
}));

vi.mock("@/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/payroll/access", () => ({ requirePayrollAdministrator: mocks.requirePayrollAdministrator }));
vi.mock("@/lib/storage", () => ({ verifyPayslipObject: mocks.verifyPayslipObject, createPayslipDownloadUrl: mocks.createPayslipDownloadUrl }));

import { PayrollError } from "@/payroll/errors";
import { GET } from "./route";

const payslipId = "123e4567-e89b-12d3-a456-426614174000";
const row = {
  payslip: { id: payslipId, status: "generated", storagePath: "opaque/v1.pdf", sha256: "a".repeat(64), immutable: true },
  payout: { id: "payout-id" },
  payrollRun: { organizationId: "organization-id" },
};

function databaseReturning(rows) {
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({ where: () => Promise.resolve(rows) }),
        }),
      }),
    }),
  };
}

describe("private payslip download route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getDb.mockReturnValue(databaseReturning([row]));
    mocks.requirePayrollAdministrator.mockResolvedValue({ organizationId: "organization-id" });
    mocks.verifyPayslipObject.mockResolvedValue(true);
    mocks.createPayslipDownloadUrl.mockResolvedValue("https://storage.invalid/signed");
  });

  it("authorizes the selected organization, verifies integrity, and returns a sixty second URL, covers: AC-7 and AC-9", async () => {
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: payslipId }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://storage.invalid/signed", expiresIn: 60 });
    expect(mocks.requirePayrollAdministrator).toHaveBeenCalledOnce();
    expect(mocks.verifyPayslipObject).toHaveBeenCalledWith("opaque/v1.pdf", "a".repeat(64));
  });

  it("returns not found inside the selected organization without checking storage, covers: AC-7 and AC-9", async () => {
    mocks.getDb.mockReturnValue(databaseReturning([]));

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: payslipId }) });

    expect(response.status).toBe(404);
    expect(mocks.requirePayrollAdministrator).toHaveBeenCalledOnce();
    expect(mocks.verifyPayslipObject).not.toHaveBeenCalled();
  });

  it("denies a signed out or lower role caller before reading the private object, covers: AC-9", async () => {
    mocks.requirePayrollAdministrator.mockRejectedValue(new PayrollError("PAYROLL_FORBIDDEN"));

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: payslipId }) });

    expect(response.status).toBe(403);
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.verifyPayslipObject).not.toHaveBeenCalled();
  });

  it("hides a generated payslip that belongs to another selected organization, covers: AC-7 and AC-9", async () => {
    mocks.requirePayrollAdministrator.mockResolvedValue({ organizationId: "other-organization-id" });
    mocks.getDb.mockReturnValue(databaseReturning([]));

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: payslipId }) });

    expect(response.status).toBe(404);
    expect(mocks.verifyPayslipObject).not.toHaveBeenCalled();
    expect(mocks.createPayslipDownloadUrl).not.toHaveBeenCalled();
  });

  it("refuses incomplete generated metadata, covers: AC-7 and AC-8", async () => {
    mocks.getDb.mockReturnValue(databaseReturning([{ ...row, payslip: { ...row.payslip, sha256: null } }]));

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: payslipId }) });

    expect(response.status).toBe(422);
    expect(mocks.createPayslipDownloadUrl).not.toHaveBeenCalled();
  });

  it("does not expose private storage provider details, covers: AC-7 and AC-9", async () => {
    mocks.createPayslipDownloadUrl.mockRejectedValue(new Error("storage provider secret response"));

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: payslipId }) });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(JSON.stringify(body)).not.toContain("storage provider secret response");
  });
});
