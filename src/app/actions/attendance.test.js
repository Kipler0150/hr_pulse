import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  requireAttendanceContext: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));
vi.mock("@/attendance/access", () => ({ requireAttendanceContext: mocks.requireAttendanceContext }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { checkInAttendance, clockOutAttendance } from "./attendance";

const context = {
  employeeId: "123e4567-e89b-12d3-a456-426614174001",
  organizationId: "123e4567-e89b-12d3-a456-426614174000",
  supabase: { rpc: mocks.rpc },
};

describe("attendance server actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireAttendanceContext.mockResolvedValue(context);
  });

  it("returns the committed trusted check in and refreshes employee and review pages, covers: AC-1 and AC-3", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ attendance_id: "interval-id", attendance_status: "open", clock_in_at: "2026-08-27T00:00:00Z", clock_out_at: null }], error: null });
    await expect(checkInAttendance()).resolves.toMatchObject({ success: true, message: "You are checked in.", interval: { id: "interval-id", status: "open" } });
    expect(mocks.rpc).toHaveBeenCalledWith("attendance_check_in", { target_organization_id: context.organizationId });
    expect(mocks.revalidatePath.mock.calls).toEqual([["/attendance"], ["/attendance/review"]]);
  });

  it("keeps expected repeat conflicts out of Sentry, covers: AC-3 and AC-7", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "ALREADY_CHECKED_IN" } });
    await expect(checkInAttendance()).resolves.toMatchObject({ success: false, issue: { code: "ALREADY_CHECKED_IN", retryable: false } });
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it("returns the committed trusted clock out and refreshes both attendance pages, covers: AC-1 and AC-3", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ attendance_id: "interval-id", attendance_status: "completed", clock_in_at: "2026-08-27T00:00:00Z", clock_out_at: "2026-08-27T08:00:00Z" }], error: null });

    await expect(clockOutAttendance()).resolves.toMatchObject({
      success: true,
      message: "You are checked out.",
      interval: { id: "interval-id", status: "completed", clockOut: "2026-08-27T08:00:00Z" },
    });
    expect(mocks.rpc).toHaveBeenCalledWith("attendance_clock_out", { target_organization_id: context.organizationId });
    expect(mocks.revalidatePath.mock.calls).toEqual([["/attendance"], ["/attendance/review"]]);
  });

  it("keeps a missing open interval conflict out of Sentry, covers: AC-3 and AC-7", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "NOT_CHECKED_IN" } });

    await expect(clockOutAttendance()).resolves.toMatchObject({ success: false, issue: { code: "NOT_CHECKED_IN", retryable: false } });
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it("fails safely and does not refresh when the database returns no committed interval, covers: AC-3 and AC-7", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    await expect(checkInAttendance()).resolves.toMatchObject({ success: false, issue: { code: "ATTENDANCE_REQUEST_FAILED" } });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.captureException).toHaveBeenCalledOnce();
  });

  it("reports an unexpected failure with safe identifiers only, covers: AC-7", async () => {
    const providerError = new Error("database detail");
    mocks.rpc.mockResolvedValue({ data: null, error: providerError });
    await expect(clockOutAttendance()).resolves.toMatchObject({ success: false, issue: { code: "ATTENDANCE_REQUEST_FAILED" } });
    expect(mocks.captureException).toHaveBeenCalledWith(expect.objectContaining({ message: "ATTENDANCE_REQUEST_FAILED" }), {
      tags: {
        action: "attendance.clock_out",
        code: "ATTENDANCE_REQUEST_FAILED",
        employeeId: context.employeeId,
        intervalId: "none",
        organizationId: context.organizationId,
      },
    });
  });
});
