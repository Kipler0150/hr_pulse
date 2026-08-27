import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  requireOrganizationAccess: vi.fn(),
  assertRole: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/auth/access", () => ({ requireOrganizationAccess: mocks.requireOrganizationAccess }));
vi.mock("@/lib/authorization", () => ({ assertRole: mocks.assertRole }));

import { requirePayrollAdministrator } from "./access";

describe("payroll administrator access", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the selected active administrator context, covers: AC-9", async () => {
    const state = { profile: { id: "profile-id" }, membership: { role: "administrator", status: "active" } };
    mocks.cookies.mockResolvedValue({ get: () => ({ value: "organization-id" }) });
    mocks.requireOrganizationAccess.mockResolvedValue(state);

    await expect(requirePayrollAdministrator()).resolves.toEqual({ ...state, organizationId: "organization-id" });
    expect(mocks.requireOrganizationAccess).toHaveBeenCalledWith("organization-id");
    expect(mocks.assertRole).toHaveBeenCalledWith(state.membership, "administrator");
  });

  it("fails closed without a selected organization, covers: AC-9", async () => {
    mocks.cookies.mockResolvedValue({ get: () => undefined });

    await expect(requirePayrollAdministrator()).rejects.toMatchObject({ code: "PAYROLL_FORBIDDEN" });
    expect(mocks.requireOrganizationAccess).not.toHaveBeenCalled();
  });

  it("maps a lower role to the safe payroll forbidden error, covers: AC-9", async () => {
    mocks.cookies.mockResolvedValue({ get: () => ({ value: "organization-id" }) });
    mocks.requireOrganizationAccess.mockResolvedValue({ membership: { role: "manager" } });
    mocks.assertRole.mockImplementation(() => { throw new Error("Forbidden"); });

    await expect(requirePayrollAdministrator()).rejects.toMatchObject({ code: "PAYROLL_FORBIDDEN", retryable: false });
  });
});
