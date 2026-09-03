import { describe, expect, it, vi } from "vitest";

import { changePrivacyHold } from "./requests";

const organizationId = "123e4567-e89b-42d3-a456-426614174000";
const administratorProfileId = "223e4567-e89b-42d3-a456-426614174000";
const outsideOrganizationProfileId = "323e4567-e89b-42d3-a456-426614174000";

function emptySelect() {
  const query = {
    from: vi.fn(() => query),
    where: vi.fn(() => query),
    limit: vi.fn().mockResolvedValue([]),
  };
  return query;
}

describe("privacy hold authorization", () => {
  it("denies a target profile without membership in the organization, covers AC-14", async () => {
    const transaction = { select: vi.fn(() => emptySelect()) };
    const db = { transaction: vi.fn((callback) => callback(transaction)) };

    await expect(changePrivacyHold({
      db,
      organizationId,
      administratorProfileId,
      profileId: outsideOrganizationProfileId,
      action: "place",
      idempotencyKey: "423e4567-e89b-42d3-a456-426614174000",
    })).rejects.toMatchObject({ code: "PRIVACY_NOT_FOUND" });
    expect(transaction.select).toHaveBeenCalledOnce();
  });
});
