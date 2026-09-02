import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSelfServiceContext: vi.fn(),
  recordSelfServiceMetric: vi.fn(),
  reportSelfServiceFailure: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/self-service/access", () => ({ requireSelfServiceContext: mocks.requireSelfServiceContext }));
vi.mock("@/self-service/telemetry", () => ({ recordSelfServiceMetric: mocks.recordSelfServiceMetric, reportSelfServiceFailure: mocks.reportSelfServiceFailure }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { updateSelfServiceProfileAction } from "./self-service";

describe("self service release gate mutation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a malformed retry identity before calling the RPC, covers: AC-4", async () => {
    const rpc = vi.fn();
    mocks.requireSelfServiceContext.mockResolvedValue({ organizationId: "organization-id", employee: { id: "employee-id" }, supabase: { rpc } });
    const formData = new FormData();
    formData.set("expectedVersion", "1");
    formData.set("requestId", "11111111-1111-4111-8111-11111111111-");
    formData.set("preferredName", "Name");
    formData.set("phone", "+639171234567");

    const result = await updateSelfServiceProfileAction({}, formData);

    expect(result).toMatchObject({ success: false, code: "SELF_SERVICE_INVALID_INPUT" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a profile mutation before touching the data provider when the portal is unavailable, covers: AC-12", async () => {
    mocks.requireSelfServiceContext.mockRejectedValue(new Error("SELF_SERVICE_DISABLED"));
    const formData = new FormData();
    formData.set("expectedVersion", "1");
    formData.set("requestId", "11111111-1111-4111-8111-111111111111");
    formData.set("preferredName", "Should not save");
    formData.set("phone", "+639171234567");

    const result = await updateSelfServiceProfileAction({}, formData);

    expect(result).toMatchObject({ success: false, code: "SELF_SERVICE_UNAVAILABLE" });
    expect(mocks.requireSelfServiceContext).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.reportSelfServiceFailure).toHaveBeenCalledOnce();
  });
});
