"use server";

import { revalidatePath } from "next/cache";

import { validateDate, validateUuid } from "@/db/validation";
import { requireOvertimeAdministrator, requireOvertimeContext } from "@/overtime/access";
import { overtimeIssue, OvertimeError } from "@/overtime/errors";
import {
  approveTimecard,
  correctAttendanceInterval,
  prepareTimecard,
  returnTimecard,
  saveOvertimePolicy,
  submitTimecard,
} from "@/overtime/service";
import { reportOvertimeFailure } from "@/overtime/telemetry";

function text(formData, key) { return String(formData.get(key) ?? "").trim(); }

function integer(formData, key, { min, max }) {
  const value = Number(text(formData, key));
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} is invalid`);
  return value;
}

function requestId(formData) { return validateUuid(text(formData, "requestId"), "requestId"); }

function responseError(error, context) {
  const safe = error instanceof OvertimeError ? error : new OvertimeError(error?.message, { cause: error });
  reportOvertimeFailure(safe, context);
  return { error: overtimeIssue(safe) };
}

function refreshTimecards(timecardId = null) {
  revalidatePath("/timecards");
  revalidatePath("/timecards/review");
  revalidatePath("/timecards/admin");
  revalidatePath("/payroll/preview");
  if (timecardId) revalidatePath(`/timecards/${timecardId}`);
}

export async function prepareTimecardAction(previousState, formData) {
  let context;
  try {
    context = await requireOvertimeContext();
    const result = await prepareTimecard({
      context,
      employeeId: validateUuid(text(formData, "employeeId"), "employeeId"),
      period: { periodStart: validateDate(text(formData, "periodStart"), "periodStart"), periodEnd: validateDate(text(formData, "periodEnd"), "periodEnd") },
      expectedVersion: text(formData, "expectedVersion") ? integer(formData, "expectedVersion", { min: 1, max: Number.MAX_SAFE_INTEGER }) : null,
      requestId: requestId(formData),
    });
    refreshTimecards(result.card.id);
    return { success: true, timecardId: result.card.id, version: result.card.version, frozen: result.frozen, duplicate: result.duplicate };
  } catch (error) { return responseError(error, { operation: "timecard.prepare", organizationId: context?.organizationId }); }
}

export async function submitTimecardAction(previousState, formData) {
  let context;
  const timecardId = text(formData, "timecardId");
  try {
    context = await requireOvertimeContext();
    const result = await submitTimecard({ context, timecardId: validateUuid(timecardId, "timecardId"), expectedVersion: integer(formData, "expectedVersion", { min: 1, max: Number.MAX_SAFE_INTEGER }), zeroHoursConfirmed: formData.get("zeroHoursConfirmed") === "on", requestId: requestId(formData) });
    refreshTimecards(timecardId);
    return { success: true, status: result.card.status, version: result.card.version, duplicate: result.duplicate };
  } catch (error) { return responseError(error, { operation: "timecard.submit", organizationId: context?.organizationId, timecardId }); }
}

export async function returnTimecardAction(previousState, formData) {
  let context;
  const timecardId = text(formData, "timecardId");
  try {
    context = await requireOvertimeContext();
    const result = await returnTimecard({ context, timecardId: validateUuid(timecardId, "timecardId"), expectedVersion: integer(formData, "expectedVersion", { min: 1, max: Number.MAX_SAFE_INTEGER }), note: text(formData, "note"), fallbackReason: text(formData, "fallbackReason"), requestId: requestId(formData) });
    refreshTimecards(timecardId);
    return { success: true, status: result.card.status, version: result.card.version, duplicate: result.duplicate };
  } catch (error) { return responseError(error, { operation: "timecard.return", organizationId: context?.organizationId, timecardId }); }
}

export async function approveTimecardAction(previousState, formData) {
  let context;
  const timecardId = text(formData, "timecardId");
  try {
    context = await requireOvertimeContext();
    const result = await approveTimecard({ context, timecardId: validateUuid(timecardId, "timecardId"), expectedVersion: integer(formData, "expectedVersion", { min: 1, max: Number.MAX_SAFE_INTEGER }), fallbackReason: text(formData, "fallbackReason"), requestId: requestId(formData) });
    refreshTimecards(timecardId);
    return { success: true, status: result.card.status, version: result.card.version, configurationDrift: result.configurationDrift, duplicate: result.duplicate };
  } catch (error) { return responseError(error, { operation: "timecard.approve", organizationId: context?.organizationId, timecardId }); }
}

export async function saveOvertimePolicyAction(previousState, formData) {
  let context;
  try {
    context = await requireOvertimeAdministrator();
    const result = await saveOvertimePolicy({ context, dailyThresholdMinutes: integer(formData, "dailyThresholdMinutes", { min: 1, max: 1440 }), enabled: formData.get("enabled") === "on", effectiveFrom: validateDate(text(formData, "effectiveFrom"), "effectiveFrom"), expectedVersion: integer(formData, "expectedVersion", { min: 0, max: Number.MAX_SAFE_INTEGER }), requestId: requestId(formData) });
    refreshTimecards();
    return { success: true, policyId: result.policy.id, version: result.policy.version, duplicate: result.duplicate };
  } catch (error) { return responseError(error, { operation: "overtime_policy.save", organizationId: context?.organizationId }); }
}

export async function correctAttendanceIntervalAction(previousState, formData) {
  let context;
  try {
    context = await requireOvertimeAdministrator();
    const correctedClockIn = text(formData, "correctedClockIn");
    const correctedClockOut = text(formData, "correctedClockOut");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z$/.test(correctedClockIn) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z$/.test(correctedClockOut)) throw new Error("Corrected times must be ISO 8601 UTC instants ending in Z");
    const result = await correctAttendanceInterval({ context, intervalId: validateUuid(text(formData, "intervalId"), "intervalId"), correctedClockIn, correctedClockOut, reason: text(formData, "reason"), expectedCorrectionId: text(formData, "expectedCorrectionId") || null, requestId: requestId(formData) });
    refreshTimecards();
    return { success: true, correctionId: result.correction.id, affectedTimecardIds: result.affectedTimecardIds, duplicate: result.duplicate };
  } catch (error) { return responseError(error, { operation: "attendance_interval.correct", organizationId: context?.organizationId }); }
}
