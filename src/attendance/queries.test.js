import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  requireAttendanceContext: vi.fn(),
  isTimeOffEnabled: vi.fn(() => false),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));
vi.mock("./access", () => ({ requireAttendanceContext: mocks.requireAttendanceContext }));
vi.mock("@/time-off/config", () => ({ isTimeOffEnabled: mocks.isTimeOffEnabled }));

import { getAttendanceReview, getEmployeeAttendance } from "./queries";

function queryResult(result) {
  const builder = {
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => builder),
    select: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue(result),
    in: vi.fn(() => builder),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

describe("attendance review queries", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.isTimeOffEnabled.mockReturnValue(false); });

  it("adds approved leave markers and uses the latest correction for a worked during leave warning, covers: AC-7", async () => {
    mocks.isTimeOffEnabled.mockReturnValue(true);
    const dayIntervals = queryResult({ data: [], error: null });
    const openInterval = queryResult({ data: null, error: null });
    const markers = queryResult({ data: [{ id: "leave-id", employee_id: "employee-id", start_date: "2026-08-27", end_date: "2026-08-27", leave_type: "paid", employees: { legal_name: "Employee", preferred_name: null } }], error: null });
    const originalIntervals = queryResult({ data: [], error: null });
    const overlappingCorrections = queryResult({ data: [{ id: "correction-id", attendance_interval_id: "interval-id" }], error: null });
    const correctedIntervals = queryResult({ data: [{ id: "interval-id", employee_id: "employee-id", clock_in: "2026-08-26T01:00:00Z", clock_out: "2026-08-26T02:00:00Z" }], error: null });
    const corrections = queryResult({ data: [{ id: "correction-id", attendance_interval_id: "interval-id", corrected_clock_in: "2026-08-27T01:00:00Z", corrected_clock_out: "2026-08-27T02:00:00Z", created_at: "2026-08-27T03:00:00Z" }], error: null });
    const builders = [dayIntervals, openInterval, markers, originalIntervals, overlappingCorrections, correctedIntervals, corrections];
    const supabase = {
      from: vi.fn(() => builders.shift()),
      rpc: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { local_date: "2026-08-27", organization_timezone: "Asia/Manila", utc_start: "2026-08-26T16:00:00Z", utc_end: "2026-08-27T16:00:00Z" }, error: null }) })),
    };
    mocks.requireAttendanceContext.mockResolvedValue({ employeeId: "employee-id", organizationId: "organization-id", supabase });

    const result = await getEmployeeAttendance();

    expect(result.leave).toEqual({ available: true, markers: [expect.objectContaining({ id: "leave-id", workedDuringLeave: true })] });
    expect(markers.eq).toHaveBeenCalledWith("status", "approved");
    expect(correctedIntervals.in).toHaveBeenCalledWith("id", ["interval-id"]);
  });

  it("keeps attendance visible and suppresses leave claims when marker loading fails, covers: AC-7", async () => {
    mocks.isTimeOffEnabled.mockReturnValue(true);
    const dayIntervals = queryResult({ data: [], error: null });
    const openInterval = queryResult({ data: null, error: null });
    const markers = queryResult({ data: null, error: new Error("private leave error") });
    const builders = [dayIntervals, openInterval, markers];
    const supabase = {
      from: vi.fn(() => builders.shift()),
      rpc: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { local_date: "2026-08-27", organization_timezone: "Asia/Manila", utc_start: "2026-08-26T16:00:00Z", utc_end: "2026-08-27T16:00:00Z" }, error: null }) })),
    };
    mocks.requireAttendanceContext.mockResolvedValue({ employeeId: "employee-id", organizationId: "organization-id", supabase });

    const result = await getEmployeeAttendance();

    expect(result.rows).toEqual([]);
    expect(result.leave).toEqual({ available: false, markers: [] });
    expect(JSON.stringify(mocks.captureException.mock.calls)).not.toContain("private leave error");
  });

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
