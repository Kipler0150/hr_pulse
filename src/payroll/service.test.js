import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/db", () => ({ getDb: mocks.getDb }));

import { decodeCursor, PAYROLL_PAGE_SIZE } from "./pagination";
import { getPayrollRunStatus, listPayrollRuns } from "./service";

function queryReturning(rows) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(rows),
    then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
  };
  return chain;
}

describe("payroll read service", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("returns a narrow completed run state and attempt count, covers: AC-5, AC-9, and AC-10", async () => {
    const run = { id: "run-id", status: "completed", updatedAt: new Date("2026-08-26T00:00:00.000Z"), leaseExpiresAt: null };
    const select = vi.fn()
      .mockReturnValueOnce(queryReturning([run]))
      .mockReturnValueOnce(queryReturning([{ count: 3 }]));
    mocks.getDb.mockReturnValue({ select });

    await expect(getPayrollRunStatus("organization-id", "run-id")).resolves.toEqual({
      run,
      attemptCount: 3,
      delayed: false,
      recoveryEligible: false,
    });
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("derives delay and recovery only after progress and lease expiry, covers: AC-5 and AC-11", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T01:00:00.000Z"));
    const run = {
      id: "run-id",
      status: "processing",
      updatedAt: new Date("2026-08-26T00:00:00.000Z"),
      lastProgressAt: new Date("2026-08-26T00:20:00.000Z"),
      leaseExpiresAt: new Date("2026-08-26T00:30:00.000Z"),
    };
    mocks.getDb.mockReturnValue({ select: vi.fn()
      .mockReturnValueOnce(queryReturning([run]))
      .mockReturnValueOnce(queryReturning([{ count: 1 }])) });

    const result = await getPayrollRunStatus("organization-id", "run-id");

    expect(result).toMatchObject({ delayed: true, recoveryEligible: true, attemptCount: 1 });
  });

  it("does not expose another organization run as present, covers: AC-9", async () => {
    mocks.getDb.mockReturnValue({ select: vi.fn()
      .mockReturnValueOnce(queryReturning([]))
      .mockReturnValueOnce(queryReturning([{ count: 0 }])) });

    await expect(getPayrollRunStatus("other-organization", "run-id")).rejects.toThrow("Payroll run not found");
  });

  it("returns fifty stable rows and an opaque compound next cursor, covers: AC-10", async () => {
    const rows = Array.from({ length: PAYROLL_PAGE_SIZE + 1 }, (_, index) => ({
      id: `run-${String(index).padStart(3, "0")}`,
      createdAt: new Date(Date.UTC(2026, 7, 26, 0, 0, PAYROLL_PAGE_SIZE - index)),
    }));
    mocks.getDb.mockReturnValue({ select: vi.fn(() => queryReturning(rows)) });

    const result = await listPayrollRuns("organization-id", null);

    expect(result.rows).toHaveLength(PAYROLL_PAGE_SIZE);
    expect(result.rows.at(-1).id).toBe("run-049");
    expect(decodeCursor(result.nextCursor, ["createdAtMilliseconds", "id"])).toEqual({
      createdAtMilliseconds: String(rows[49].createdAt.getTime()),
      id: "run-049",
    });
  });

  it("returns no next cursor at the final page, covers: AC-10", async () => {
    const rows = [{ id: "run-id", createdAt: new Date("2026-08-26T00:00:00.000Z") }];
    mocks.getDb.mockReturnValue({ select: vi.fn(() => queryReturning(rows)) });

    await expect(listPayrollRuns("organization-id", null)).resolves.toEqual({ rows, nextCursor: null });
  });
});
