"use server";

import { revalidatePath } from "next/cache";
import { requireTimeOffContext } from "@/time-off/access";
import { TimeOffError, serializeTimeOffError } from "@/time-off/config";
import { validateRequestInput, normalizeText, assertRetryRequestId } from "@/time-off/domain";
import { recordTimeOffMetric, reportTimeOffFailure } from "@/time-off/telemetry";
import { recordProductMilestone } from "@/product-operations/integration";

function safeActionError(error) {
  return error instanceof TimeOffError ? error : new TimeOffError("TIME_OFF_REQUEST_FAILED", { cause: error });
}

async function mutation({ operation, rpc, input, map }) {
  let context;
  const startedAt = Date.now();
  try {
    context = await requireTimeOffContext({ review: operation !== "submit" && operation !== "cancel" });
    const payload = map(input);
    const { data, error } = await context.supabase.rpc(rpc, { target_organization_id: context.organizationId, ...payload });
    if (error) throw new TimeOffError(error.message?.includes("TIME_OFF_") ? error.message : "TIME_OFF_REQUEST_FAILED", { cause: error });
    revalidatePath("/time-off"); revalidatePath("/time-off/review"); revalidatePath("/attendance"); revalidatePath("/attendance/review");
    const result = Array.isArray(data) ? data[0] : data;
    const retryOutcome = result?.retryOutcome === "created" ? "new" : result?.retryOutcome;
    recordTimeOffMetric({ operation: `time_off.${operation}`, organizationId: context.organizationId, requestId: input?.requestId, retryOutcome, durationMs: Date.now() - startedAt });
    const milestone = { submit: "time_off.submitted", approve: "time_off.approved", decline: "time_off.declined" }[operation];
    if (milestone && result?.id && result?.version) await recordProductMilestone({
      organizationId: context.organizationId,
      eventName: milestone,
      workflowArea: "time_off",
      resultCategory: "success",
      occurrenceIdentity: `${result.id}:${result.version}`,
      analyticsProfileId: context.profile?.id,
    });
    return { success: true, result: retryOutcome ? { ...result, retryOutcome } : result };
  } catch (error) {
    const safe = safeActionError(error);
    reportTimeOffFailure(safe, { operation: `time_off.${operation}`, organizationId: context?.organizationId, requestId: input?.requestId, durationMs: Date.now() - startedAt });
    return { success: false, issue: serializeTimeOffError(safe) };
  }
}

export async function submitLeaveRequest(input) {
  return mutation({ operation: "submit", rpc: "submit_leave_request", input, map: (value) => { const parsed = validateRequestInput(value); return { start_date: parsed.startDate, end_date: parsed.endDate, leave_type: parsed.leaveType, reason: parsed.reason, retry_request_id: assertRetryRequestId(value.retryRequestId) }; } });
}

export async function cancelLeaveRequest(input) {
  return mutation({ operation: "cancel", rpc: "cancel_leave_request", input, map: (value) => ({ target_request_id: value.requestId, expected_version: value.expectedVersion, retry_request_id: assertRetryRequestId(value.retryRequestId) }) });
}

export async function approveLeaveRequest(input) {
  return mutation({ operation: "approve", rpc: "approve_leave_request", input, map: (value) => ({ target_request_id: value.requestId, expected_version: value.expectedVersion, fallback_reason: normalizeText(value.fallbackReason), retry_request_id: assertRetryRequestId(value.retryRequestId) }) });
}

export async function declineLeaveRequest(input) {
  return mutation({ operation: "decline", rpc: "decline_leave_request", input, map: (value) => ({ target_request_id: value.requestId, expected_version: value.expectedVersion, decision_note: normalizeText(value.decisionNote), fallback_reason: normalizeText(value.fallbackReason), retry_request_id: assertRetryRequestId(value.retryRequestId) }) });
}
