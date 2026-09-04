import { describe, expect, it, vi } from "vitest";

import { PRIVACY_POLICY_VERSION } from "./config";
import { saveProductAnalyticsConsent } from "./consent";

const organizationId = "123e4567-e89b-42d3-a456-426614174000";
const profileId = "223e4567-e89b-42d3-a456-426614174000";
const idempotencyKey = "323e4567-e89b-42d3-a456-426614174000";

function replayDatabase(replayed) {
  const limit = vi.fn().mockResolvedValue([replayed]);
  const transaction = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit })),
      })),
    })),
    update: vi.fn(),
    insert: vi.fn(),
  };
  return { transaction: vi.fn((callback) => callback(transaction)), tx: transaction };
}

describe("privacy consent idempotency", () => {
  it("rejects a retry that reuses a key for a different decision, covers: AC-3", async () => {
    const db = replayDatabase({
      organizationId,
      profileId,
      consentType: "product_analytics",
      granted: true,
      policyVersion: PRIVACY_POLICY_VERSION,
      idempotencyKey,
    });

    await expect(saveProductAnalyticsConsent({ db, organizationId, profileId, granted: false, idempotencyKey }))
      .rejects.toMatchObject({ code: "PRIVACY_IDEMPOTENCY_CONFLICT" });
    expect(db.tx.update).not.toHaveBeenCalled();
    expect(db.tx.insert).not.toHaveBeenCalled();
  });
});
