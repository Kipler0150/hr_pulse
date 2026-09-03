import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertProductOperationsEnabled: vi.fn(),
  cookies: vi.fn(),
  getAccessState: vi.fn(),
  validateUuid: vi.fn((value) => value),
}));

vi.mock("./config", () => ({ assertProductOperationsEnabled: mocks.assertProductOperationsEnabled }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/auth/access", () => ({ getAccessState: mocks.getAccessState }));
vi.mock("@/db/validation", () => ({ validateUuid: mocks.validateUuid }));

import { requireProductOperationsContext } from "./access";

describe("product operations access", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.assertProductOperationsEnabled.mockImplementation(() => {});
    mocks.cookies.mockResolvedValue({ get: vi.fn(() => ({ value: "123e4567-e89b-42d3-a456-426614174000" })) });
  });

  it("preserves the disabled release error, covers AC-1", async () => {
    mocks.assertProductOperationsEnabled.mockImplementation(() => {
      const error = new Error("disabled");
      error.code = "PRODUCT_OPERATIONS_DISABLED";
      throw error;
    });

    await expect(requireProductOperationsContext()).rejects.toMatchObject({ code: "PRODUCT_OPERATIONS_DISABLED" });
  });

  it("denies a signed in user without an active administrator membership, covers AC-1", async () => {
    mocks.getAccessState.mockResolvedValue({ user: { id: "user" }, profile: { status: "active" }, selected: { role: "manager" } });

    await expect(requireProductOperationsContext()).rejects.toMatchObject({ code: "PRODUCT_OPERATIONS_FORBIDDEN" });
  });

  it("returns the selected administrator workspace context, covers AC-1 and AC-7", async () => {
    const organization = { id: "123e4567-e89b-42d3-a456-426614174000", timezone: "America/New_York" };
    const selected = { organizationId: organization.id, role: "administrator", organization };
    mocks.getAccessState.mockResolvedValue({ user: { id: "user" }, profile: { id: "profile", status: "active" }, selected });

    await expect(requireProductOperationsContext()).resolves.toMatchObject({
      organizationId: organization.id,
      membership: selected,
      organization,
      timezone: "America/New_York",
    });
  });
});
