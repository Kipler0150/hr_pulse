import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/audit", () => ({ writeAuditEvent: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/db";
import { writeAuditEvent } from "@/lib/audit";
import { memberships, organizations, payrollSchedules, profiles } from "@/db/schema";
import { createOrganization } from "./organizations";

describe("organization founding authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  function installFixture({ profile = null, founder = null, membershipCount = 0, slugExists = false } = {}) {
    createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-id", email: "person@example.com", app_metadata: { organization_bootstrap: true } } }, error: null }) },
    });

    let organizationReads = 0;
    const transaction = {
      select: vi.fn(() => ({
        from: vi.fn((table) => ({
          where: vi.fn().mockResolvedValue(
            table === profiles
              ? (profile ? [profile] : [])
              : table === memberships
                ? [{ count: membershipCount }]
                : table === organizations
                  ? (organizationReads++ === 0 ? (founder ? [founder] : []) : (slugExists ? [{ id: "existing-slug" }] : []))
                  : [],
          ),
        })),
      })),
      insert: vi.fn((table) => ({
        values: vi.fn((values) => ({
          returning: vi.fn().mockResolvedValue(
            table === organizations
              ? [{ id: "organization-id", ...values, status: "active" }]
              : table === memberships
                ? [{ id: "membership-id", ...values }]
                : [{ id: "schedule-id", ...values, version: 1 }],
          ),
        })),
      })),
    };
    getDb.mockReturnValue({ transaction: vi.fn((callback) => callback(transaction)) });
    return transaction;
  }

  const validInput = {
    name: "Example organization",
    timezone: "UTC",
    defaultCurrency: "USD",
    frequency: "monthly",
    effectiveStartDate: "2026-08-01",
  };

  it("rejects an authenticated user without a trusted bootstrap entitlement", async () => {
    createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-id", email: "person@example.com" } }, error: null }) },
    });

    await expect(createOrganization({
      name: "Example organization",
      timezone: "UTC",
      defaultCurrency: "USD",
      frequency: "monthly",
      effectiveStartDate: "2026-08-01",
    })).rejects.toThrow("Organization founding is not available");
  });

  it("rejects an entitled user without a provisioned profile", async () => {
    installFixture();
    await expect(createOrganization(validInput)).rejects.toThrow("active provisioned profile");
  });

  it("rejects an entitled user with an existing organization relationship", async () => {
    installFixture({ profile: { id: "profile-id", status: "inactive" } });
    await expect(createOrganization(validInput)).rejects.toThrow("active provisioned profile");

    installFixture({ profile: { id: "profile-id", status: "active" }, membershipCount: 1 });
    await expect(createOrganization(validInput)).rejects.toThrow("cannot found another organization");

    installFixture({ profile: { id: "profile-id", status: "active" }, founder: { id: "existing-organization" } });
    await expect(createOrganization(validInput)).rejects.toThrow("cannot found another organization");
  });

  it("creates one administrator membership for an entitled active profile", async () => {
    const transaction = installFixture({ profile: { id: "profile-id", status: "active" } });

    await expect(createOrganization(validInput)).resolves.toMatchObject({
      organizationId: "organization-id",
      administratorMembershipId: "membership-id",
      payrollScheduleId: "schedule-id",
    });
    expect(transaction.insert).toHaveBeenCalledTimes(3);
    expect(transaction.insert.mock.calls[1][0]).toBe(memberships);
    expect(transaction.insert.mock.results[1].value.values).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "organization-id",
      profileId: "profile-id",
      role: "administrator",
      status: "active",
    }));
    expect(writeAuditEvent).toHaveBeenCalledOnce();
  });
});
