import { describe, expect, it, vi } from "vitest";

import { getEmployeeLeaveRequests, getLeaveRequestDetail, getLeaveReviewQueue } from "./queries";

function queryResult(result) {
  const builder = {
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    in: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => builder),
    select: vi.fn(() => builder),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

function context(role = "employee", employeeId = "employee-id", result = { data: [], error: null }) {
  const query = queryResult(result);
  return {
    query,
    context: { organizationId: "organization-id", employeeId, membership: { role }, supabase: { from: vi.fn(() => query), rpc: vi.fn() } },
  };
}

describe("time off read queries", () => {
  it("rejects employee history without an employee context, covers AC-6 and AC-9", async () => {
    await expect(getEmployeeLeaveRequests({ context: { organizationId: "organization-id", supabase: {} } })).rejects.toMatchObject({ code: "TIME_OFF_FORBIDDEN" });
  });

  it("rejects malformed filters before querying the database, covers AC-6", async () => {
    const supabase = { from: vi.fn() };

    await expect(getEmployeeLeaveRequests({ context: { organizationId: "organization-id", employeeId: "employee-id", supabase }, startDate: "2026-02-30" })).rejects.toMatchObject({ code: "TIME_OFF_INVALID_FILTER" });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("keeps one sided date filters inclusive, covers AC-6", async () => {
    const startOnly = context();
    await getEmployeeLeaveRequests({ context: startOnly.context, startDate: "2026-09-10" });
    expect(startOnly.query.gte).toHaveBeenCalledWith("end_date", "2026-09-10");
    expect(startOnly.query.lte).not.toHaveBeenCalledWith("start_date", "2026-09-10");

    const endOnly = context();
    await getEmployeeLeaveRequests({ context: endOnly.context, endDate: "2026-09-10" });
    expect(endOnly.query.lte).toHaveBeenCalledWith("start_date", "2026-09-10");
    expect(endOnly.query.gte).not.toHaveBeenCalledWith("end_date", "2026-09-10");
  });

  it("lets a manager narrow the queue to a direct report, covers AC-6 and AC-9", async () => {
    const { context: managerContext, query } = context("manager", "manager-id");

    await expect(getLeaveReviewQueue({ context: managerContext, employeeId: "direct-report-id" })).resolves.toEqual({ rows: [], nextCursor: null });
    expect(query.eq).toHaveBeenCalledWith("employee_id", "direct-report-id");
  });

  it("rejects a manager queue without a linked employee, covers AC-9", async () => {
    const { context: managerContext } = context("manager", null);

    await expect(getLeaveReviewQueue({ context: managerContext })).rejects.toMatchObject({ code: "TIME_OFF_FORBIDDEN" });
    expect(managerContext.supabase.from).not.toHaveBeenCalled();
  });

  it("maps reviewer read failures to a safe retryable error, covers AC-6 and AC-11", async () => {
    const { context: managerContext } = context("manager", "manager-id", { data: null, error: { code: "PGRST000" } });

    await expect(getLeaveReviewQueue({ context: managerContext })).rejects.toMatchObject({ code: "TIME_OFF_REQUEST_FAILED" });
  });

  it("returns a newest first employee page with a stable cursor after 50 rows, covers AC-6 and AC-12", async () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      employee_id: "employee-id",
      start_date: "2026-09-01",
      end_date: "2026-09-01",
      leave_type: "paid",
      status: "submitted",
      submitted_at: new Date(Date.UTC(2026, 7, 31, 12, index)).toISOString(),
      version: 1,
    }));
    const { context: employeeContext, query } = context("employee", "employee-id", { data: rows, error: null });

    const result = await getEmployeeLeaveRequests({ context: employeeContext });

    expect(result.rows).toHaveLength(50);
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(query.limit).toHaveBeenCalledWith(51);
    expect(query.order).toHaveBeenCalledWith("submitted_at", { ascending: false });
  });

  it("maps direct report queue rows and returns an opaque cursor, covers AC-6", async () => {
    const row = {
      id: "00000000-0000-4000-8000-000000000001",
      employee_id: "employee-id",
      start_date: "2026-09-01",
      end_date: "2026-09-02",
      leave_type: "sick",
      status: "submitted",
      submitted_at: "2026-08-31T10:00:00.000Z",
      version: 1,
      employees: { employee_number: "EMP-1", legal_name: "Employee One", preferred_name: null },
    };
    const { context: managerContext, query } = context("manager", "manager-id", { data: [row], error: null });

    const result = await getLeaveReviewQueue({ context: managerContext });

    expect(result.rows).toEqual([expect.objectContaining({ employeeId: "employee-id", employeeNumber: "EMP-1", employeeName: "Employee One", calendarDays: 2 })]);
    expect(query.eq).toHaveBeenCalledWith("employees.manager_id", "manager-id");
    expect(result.nextCursor).toBeNull();
  });

  it("returns only the exact detail payload and maps missing details to unavailable, covers AC-6 and AC-10", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ request_id: "request-id", reason: "private note", events: [] }], error: null });
    const detail = await getLeaveRequestDetail({ context: { organizationId: "organization-id", supabase: { rpc } }, requestId: "request-id" });

    expect(detail).toEqual({ request_id: "request-id", reason: "private note", events: [] });
    expect(rpc).toHaveBeenCalledWith("get_leave_request_detail", { target_organization_id: "organization-id", target_request_id: "request-id" });

    rpc.mockResolvedValue({ data: [], error: null });
    await expect(getLeaveRequestDetail({ context: { organizationId: "organization-id", supabase: { rpc } }, requestId: "missing" })).rejects.toMatchObject({ code: "TIME_OFF_UNAVAILABLE" });
  });
});
