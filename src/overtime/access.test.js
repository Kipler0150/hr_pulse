import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertOvertimeEnabled: vi.fn(),
  cookies: vi.fn(),
  requireOrganizationAccess: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/auth/access", () => ({ requireOrganizationAccess: mocks.requireOrganizationAccess }));
vi.mock("./config", () => ({ assertOvertimeEnabled: mocks.assertOvertimeEnabled }));

import { requireOvertimeContext } from "./access";

describe("overtime access context", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exposes the selected organization used by timecard pages and calculations", async () => {
    const organization = { id: "organization-id", timezone: "Asia/Manila" };
    mocks.cookies.mockResolvedValue({ get: vi.fn().mockReturnValue({ value: organization.id }) });
    mocks.requireOrganizationAccess.mockResolvedValue({
      profile: { id: "profile-id" },
      membership: { role: "administrator", employeeId: "employee-id", organization, organizationId: organization.id },
    });

    await expect(requireOvertimeContext()).resolves.toMatchObject({
      organizationId: organization.id,
      organization,
      employeeId: "employee-id",
    });
  });

  it("uses the sole authorized membership when the organization cookie is absent", async () => {
    const organization = { id: "organization-id", timezone: "Asia/Manila" };
    mocks.cookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) });
    mocks.requireOrganizationAccess.mockResolvedValue({
      profile: { id: "profile-id" },
      membership: { role: "administrator", organizationId: organization.id, organization },
    });

    await expect(requireOvertimeContext()).resolves.toMatchObject({ organizationId: organization.id });
    expect(mocks.requireOrganizationAccess).toHaveBeenCalledWith(undefined);
  });
});
