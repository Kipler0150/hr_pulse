import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertPrivacyEnabled: vi.fn(),
  cookies: vi.fn(),
  getAccessState: vi.fn(),
  validateUuid: vi.fn((value) => value),
}));

vi.mock("./config", () => ({ assertPrivacyEnabled: mocks.assertPrivacyEnabled }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/auth/access", () => ({ getAccessState: mocks.getAccessState }));
vi.mock("@/db/validation", () => ({ validateUuid: mocks.validateUuid }));

import { getPrivacyAccessState, requirePrivacyContext } from "./access";

const organizationId = "123e4567-e89b-42d3-a456-426614174000";
const profileId = "223e4567-e89b-42d3-a456-426614174000";

describe("privacy access", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.assertPrivacyEnabled.mockImplementation(() => {});
    mocks.cookies.mockResolvedValue({ get: vi.fn(() => ({ value: organizationId })) });
  });

  it("loads access state with the selected organization", async () => {
    const state = { user: { id: "user" }, profile: { id: profileId, status: "active" }, selected: { organizationId } };
    mocks.getAccessState.mockResolvedValue(state);

    await expect(getPrivacyAccessState()).resolves.toBe(state);
    expect(mocks.getAccessState).toHaveBeenCalledWith({ organizationId });
  });

  it("reuses the page access state instead of reading auth a second time", async () => {
    const selected = { organizationId, role: "employee", organization: { id: organizationId } };
    const state = { user: { id: "user" }, profile: { id: profileId, status: "active" }, selected };

    await expect(requirePrivacyContext({ state })).resolves.toMatchObject({
      organizationId,
      membership: selected,
      organization: selected.organization,
    });
    expect(mocks.getAccessState).not.toHaveBeenCalled();
    expect(mocks.cookies).not.toHaveBeenCalled();
  });
});
