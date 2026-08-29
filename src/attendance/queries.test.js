import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  requireAttendanceContext: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));
vi.mock("./access", () => ({ requireAttendanceContext: mocks.requireAttendanceContext }));

import { getAttendanceReview, getEmployeeAttendance } from "./queries";

function queryResult(result) {
  const builder = {
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => builder),
    select: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

describe("attendance review queries", () => {
  beforeEach(() => vi.resetAllMocks());

  it("uses database local day bounds, caps a page at 50, and emits a stable next cursor, covers: AC-4", async () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: `123e4567-e89b-42d3-a456-${String(426614174000 + index).padStart(12, "0")}`,
      employee_id: "123e4567-e89b-42d3-a456-426614174999",
      clock_in: new Date(Date.UTC(2026, 7, 27, 12, 0, 0) - index * 60_000).toISOString(),
      clock_out: null,
      status: "open",
      employees: { legal_name: "Employee", preferred_name: null },
    }));
    const intervals = queryResult({ data: rows, error: null });
    const supabase = {
      from: vi.fn(() => intervals),
      rpc: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { local_date: "2026-08-27", organization_timezone: "Asia/Manila", utc_start: "2026-08-26T16:00:00Z", utc_end: "2026-08-27T16:00:00Z" }, error: null }),
      })),
    };
    mocks.requireAttendanceContext.mockResolvedValue({ organizationId: "organization-id", supabase });

    const result = await getAttendanceReview({ date: "2026-08-27" });

    expect(result.rows).toHaveLength(50);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(supabase.rpc).toHaveBeenCalledWith("attendance_day_context", { requested_date: "2026-08-27", target_organization_id: "organization-id" });
    expect(intervals.limit).toHaveBeenCalledWith(51);
  });

  it("rejects a malformed date before asking PostgreSQL for a day, covers: AC-4 and AC-7", async () => {
    const supabase = { rpc: vi.fn() };
    mocks.requireAttendanceContext.mockResolvedValue({ organizationId: "organization-id", supabase });

    await expect(getAttendanceReview({ date: "2026-02-30" })).rejects.toMatchObject({ code: "INVALID_REVIEW_DATE" });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it("reads only the employee local day and returns the current open interval, covers: AC-2 and AC-5", async () => {
    const completed = { id: "interval-completed", employee_id: "employee-id", clock_in: "2026-08-27T00:00:00Z", clock_out: "2026-08-27T08:00:00Z", source: "employee", status: "completed" };
    const open = { id: "interval-open", employee_id: "employee-id", clock_in: "2026-08-27T09:00:00Z", clock_out: null, source: "employee", status: "open" };
    const dayIntervals = queryResult({ data: [open, completed], error: null });
    const openInterval = queryResult({ data: open, error: null });
    const builders = [dayIntervals, openInterval];
    const supabase = {
      from: vi.fn(() => builders.shift()),
      rpc: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { local_date: "2026-08-27", organization_timezone: "Asia/Manila", utc_start: "2026-08-26T16:00:00Z", utc_end: "2026-08-27T16:00:00Z" }, error: null }),
      })),
    };
    mocks.requireAttendanceContext.mockResolvedValue({ employeeId: "employee-id", organizationId: "organization-id", supabase });

    const result = await getEmployeeAttendance();

    expect(result.rows).toHaveLength(2);
    expect(result.openInterval).toMatchObject({ id: "interval-open", status: "open" });
    expect(dayIntervals.eq).toHaveBeenCalledWith("employee_id", "employee-id");
    expect(dayIntervals.gte).toHaveBeenCalledWith("clock_in", "2026-08-26T16:00:00Z");
    expect(dayIntervals.lt).toHaveBeenCalledWith("clock_in", "2026-08-27T16:00:00Z");
    expect(openInterval.eq.mock.calls).toEqual([["employee_id", "employee-id"], ["status", "open"]]);
  });

  it("reports an unexpected employee read failure without provider details, covers: AC-7", async () => {
    const providerError = new Error("private database detail");
    const dayIntervals = queryResult({ data: null, error: providerError });
    const openInterval = queryResult({ data: null, error: null });
    const builders = [dayIntervals, openInterval];
    const supabase = {
      from: vi.fn(() => builders.shift()),
      rpc: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: { local_date: "2026-08-27", organization_timezone: "Asia/Manila", utc_start: "2026-08-26T16:00:00Z", utc_end: "2026-08-27T16:00:00Z" }, error: null }),
      })),
    };
    mocks.requireAttendanceContext.mockResolvedValue({ employeeId: "employee-id", organizationId: "organization-id", supabase });

    await expect(getEmployeeAttendance()).rejects.toMatchObject({ code: "ATTENDANCE_REQUEST_FAILED" });
    expect(mocks.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "ATTENDANCE_REQUEST_FAILED" }),
      expect.objectContaining({ tags: expect.objectContaining({ action: "attendance.employee_read" }) }),
    );
    expect(JSON.stringify(mocks.captureException.mock.calls)).not.toContain("private database detail");
  });
});
