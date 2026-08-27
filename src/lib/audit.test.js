import { describe, expect, it, vi } from "vitest";
import { assertEmployeeAccess, assertRole, resolveOrganizationAccess } from "./authorization";
import { sanitizeAuditMetadata } from "./audit";

describe("authorization and audit boundaries", () => {
  it("allows a role to satisfy a lower access level only", () => {
    const manager = { role: "manager" };
    expect(assertRole(manager, "employee")).toBe(manager);
    expect(() => assertRole(manager, "administrator")).toThrow("Forbidden");
  });

  it("removes secrets and unnecessary sensitive values from audit metadata", () => {
    expect(sanitizeAuditMetadata({
      operation: "terminate",
      token: "hidden",
      nested: { password: "hidden", count: 1 },
    })).toEqual({ operation: "terminate", nested: { count: 1 } });
  });

  it("removes payroll and personal values at every nesting level, covers: AC-9", () => {
    expect(sanitizeAuditMetadata({
      grossAmountMinor: 500_000,
      legalName: "Synthetic Employee",
      rows: [{ employeeId: "employee-id", netAmountMinor: 450_000, nested: { document: "pdf bytes", status: "completed" } }],
    })).toEqual({ rows: [{ employeeId: "employee-id", nested: { status: "completed" } }] });
  });

  it("resolves an authenticated organization membership and employee link", async () => {
    const db = {
      select: vi.fn()
        .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([{ id: "profile-id", status: "active" }]) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([{ id: "membership-id", role: "employee", status: "active" }]) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([{ id: "organization-id", status: "active" }]) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => Promise.resolve([{ id: "employee-id" }]) }) }),
    };
    const supabase = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "123e4567-e89b-12d3-a456-426614174000" } }, error: null }) } };

    const access = await resolveOrganizationAccess({
      supabase, db, organizationId: "123e4567-e89b-12d3-a456-426614174001",
    });

    expect(access.membership).toMatchObject({ id: "membership-id", role: "employee", employeeId: "employee-id" });
  });

  it("denies an employee access to another employee record", async () => {
    const db = {
      select: () => ({ from: () => ({ where: () => Promise.resolve([{ id: "other-employee" }]) }) }),
    };

    await expect(assertEmployeeAccess({
      db,
      membership: { role: "employee", profileId: "profile-id", employeeId: "employee-id" },
      employeeId: "123e4567-e89b-12d3-a456-426614174000",
    })).rejects.toThrow("Forbidden");
  });
});
