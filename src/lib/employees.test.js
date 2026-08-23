import { describe, expect, it, vi } from "vitest";
import { deactivateEmployee } from "./employees";

describe("employee deactivation", () => {
  it("rejects an employee from another organization", async () => {
    const transaction = {
      select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    };
    const db = { transaction: vi.fn(async callback => callback(transaction)) };

    await expect(deactivateEmployee(db, {
      organizationId: "123e4567-e89b-12d3-a456-426614174000",
      employeeId: "123e4567-e89b-12d3-a456-426614174001",
      actorProfileId: "123e4567-e89b-12d3-a456-426614174002",
      terminationDate: "2026-08-23",
    })).rejects.toThrow("Employee not found");
  });
});