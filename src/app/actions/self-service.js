"use server";

import { revalidatePath } from "next/cache";

import { validateUuid } from "@/db/validation";

import { requireSelfServiceContext } from "@/self-service/access";
import { SelfServiceError, serializeSelfServiceError } from "@/self-service/errors";
import { recordSelfServiceMetric, reportSelfServiceFailure } from "@/self-service/telemetry";

function text(formData, name) { return String(formData.get(name) ?? ""); }

export async function updateSelfServiceProfileAction(previousState, formData) {
  const startedAt = Date.now(); let context;
  try {
    context = await requireSelfServiceContext();
    const expectedVersion = Number(text(formData, "expectedVersion"));
    const requestId = text(formData, "requestId");
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new SelfServiceError("SELF_SERVICE_INVALID_INPUT");
    try { validateUuid(requestId, "requestId"); } catch { throw new SelfServiceError("SELF_SERVICE_INVALID_INPUT"); }
    const preferredName = text(formData, "preferredName").trim();
    const phone = text(formData, "phone").trim();
    if (preferredName.length > 200 || (phone && !/^\+[0-9]{7,15}$/.test(phone))) throw new SelfServiceError("SELF_SERVICE_INVALID_INPUT");
    const { data, error } = await context.supabase.rpc("update_self_service_profile", {
      target_organization_id: context.organizationId,
      submitted_preferred_name: preferredName,
      submitted_phone: phone,
      expected_version: expectedVersion,
      retry_request_id: requestId,
    });
    if (error) {
      const message = String(error.message || "");
      const code = ["SELF_SERVICE_INVALID_INPUT", "SELF_SERVICE_STALE", "SELF_SERVICE_RETRY_CONFLICT", "SELF_SERVICE_ACCESS_UNAVAILABLE"].find((candidate) => message.includes(candidate));
      throw new SelfServiceError(code ?? "SELF_SERVICE_UNAVAILABLE");
    }
    revalidatePath("/self-service");
    revalidatePath("/self-service/profile");
    recordSelfServiceMetric({ operation: "self_service.profile.update", organizationId: context.organizationId, employeeId: context.employee.id, result: "success", retryOutcome: data?.replayed ? "replayed" : "new", durationMs: Date.now() - startedAt });
    return { success: true, message: "Your contact details are current.", result: data };
  } catch (error) {
    reportSelfServiceFailure(error, { operation: "self_service.profile.update", organizationId: context?.organizationId, employeeId: context?.employee.id, durationMs: Date.now() - startedAt });
    return { success: false, ...serializeSelfServiceError(error) };
  }
}
