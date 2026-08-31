import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireTimeOffContext: vi.fn(),
  revalidatePath: vi.fn(),
  recordTimeOffMetric: vi.fn(),
  reportTimeOffFailure: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/time-off/access", () => ({ requireTimeOffContext: mocks.requireTimeOffContext }));
vi.mock("@/time-off/telemetry", () => ({ recordTimeOffMetric: mocks.recordTimeOffMetric, reportTimeOffFailure: mocks.reportTimeOffFailure }));

const { approveLeaveRequest, cancelLeaveRequest, declineLeaveRequest, submitLeaveRequest } = await import("./time-off");

describe("time off server actions", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: { result: { requestId: "request-1", status: "submitted", version: 1 }, retryOutcome: "created" }, error: null });
    mocks.requireTimeOffContext.mockResolvedValue({ organizationId: "org-1", supabase: { rpc } });
  });

  it("submits a valid request and exposes a new retry outcome (covers AC-1, AC-5)", async () => {
    const result = await submitLeaveRequest({ startDate: "2026-09-02", endDate: "2026-09-03", leaveType: "paid", reason: " Family appointment ", retryRequestId: "11111111-1111-4111-8111-111111111111" });

    expect(result).toEqual({ success: true, result: { result: { requestId: "request-1", status: "submitted", version: 1 }, retryOutcome: "new" } });
    expect(rpc).toHaveBeenCalledWith("submit_leave_request", expect.objectContaining({ target_organization_id: "org-1", start_date: "2026-09-02", end_date: "2026-09-03", leave_type: "paid", reason: "Family appointment", retry_request_id: "11111111-1111-4111-8111-111111111111" }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/time-off");
  });

  it("maps approval input to the protected transition RPC (covers AC-4, AC-5)", async () => {
    const result = await approveLeaveRequest({ requestId: "request-1", expectedVersion: 1, fallbackReason: "  ", retryRequestId: "22222222-2222-4222-8222-222222222222" });

    expect(result.success).toBe(true);
    expect(rpc).toHaveBeenCalledWith("approve_leave_request", { target_organization_id: "org-1", target_request_id: "request-1", expected_version: 1, fallback_reason: null, retry_request_id: "22222222-2222-4222-8222-222222222222" });
  });

  it("normalizes decline notes before sending them to the transition RPC (covers AC-3, AC-4, AC-10)", async () => {
    await declineLeaveRequest({ requestId: "request-1", expectedVersion: 1, decisionNote: "  Not available\r\n this week  ", fallbackReason: "  ", retryRequestId: "33333333-3333-4333-8333-333333333333" });

    expect(rpc).toHaveBeenCalledWith("decline_leave_request", { target_organization_id: "org-1", target_request_id: "request-1", expected_version: 1, decision_note: "Not available\n this week", fallback_reason: null, retry_request_id: "33333333-3333-4333-8333-333333333333" });
  });

  it("maps cancellation to the protected transition RPC, covers AC-3 and AC-5", async () => {
    const result = await cancelLeaveRequest({ requestId: "request-1", expectedVersion: 1, retryRequestId: "66666666-6666-4666-8666-666666666666" });

    expect(result.success).toBe(true);
    expect(rpc).toHaveBeenCalledWith("cancel_leave_request", { target_organization_id: "org-1", target_request_id: "request-1", expected_version: 1, retry_request_id: "66666666-6666-4666-8666-666666666666" });
  });

  it("returns a safe catalog error when the database reports a known workflow failure (covers AC-2, AC-5)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "TIME_OFF_OVERLAP" } });

    const result = await submitLeaveRequest({ startDate: "2026-09-02", endDate: "2026-09-02", leaveType: "paid", retryRequestId: "44444444-4444-4444-8444-444444444444" });

    expect(result).toEqual({ success: false, issue: expect.objectContaining({ code: "TIME_OFF_OVERLAP", retryable: false }) });
  });

  it("returns forbidden when context authorization fails before the RPC is called (covers AC-8, AC-9)", async () => {
    mocks.requireTimeOffContext.mockRejectedValue(new Error("unauthorized"));

    const result = await submitLeaveRequest({ startDate: "2026-09-02", endDate: "2026-09-02", leaveType: "paid", retryRequestId: "55555555-5555-4555-8555-555555555555" });

    expect(result).toEqual({ success: false, issue: expect.objectContaining({ code: "TIME_OFF_REQUEST_FAILED" }) });
    expect(rpc).not.toHaveBeenCalled();
  });
});
