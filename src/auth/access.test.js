import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/db", () => ({ getDb: vi.fn() }));

import { safeReturnTo } from "./access";
import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/db";
import { getAccessState, getCurrentUser, requireOrganizationAccess } from "./access";

describe("authentication access helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps return paths inside the application", () => {
    expect(safeReturnTo("/dashboard?tab=attendance")).toBe("/dashboard?tab=attendance");
    expect(safeReturnTo("https://example.com")).toBe("/dashboard");
    expect(safeReturnTo("//example.com")).toBe("/dashboard");
  });

  it("treats a missing Supabase session as signed out", async () => {
    createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockRejectedValue({ name: "AuthSessionMissingError" }) } });

    await expect(getCurrentUser()).resolves.toMatchObject({ user: null });
  });

  it("returns pending access when an authenticated user has no local profile", async () => {
    createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-id" } } }) } });
    getDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from: () => ({ where: () => Promise.resolve([]) }) }) });

    await expect(getAccessState()).resolves.toMatchObject({ user: { id: "user-id" }, profile: null, memberships: [] });
  });

  it("rejects an organization that is not an active membership", async () => {
    createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } });

    await expect(requireOrganizationAccess("123e4567-e89b-12d3-a456-426614174000")).rejects.toThrow("Authentication required");
  });
});