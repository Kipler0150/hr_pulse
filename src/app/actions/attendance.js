"use server";

import { revalidatePath } from "next/cache";

import { requireAttendanceContext } from "@/attendance/access";
import {
  AttendanceError,
  attendanceErrorFromSupabase,
  serializeAttendanceError,
} from "@/attendance/errors";
import { reportAttendanceFailure } from "@/attendance/telemetry";
import { recordProductMilestone } from "@/product-operations/integration";

async function runAttendanceMutation({ action, rpc, successMessage }) {
  let context;
  try {
    context = await requireAttendanceContext();
    const { data, error } = await context.supabase.rpc(rpc, {
      target_organization_id: context.organizationId,
    });
    if (error) throw attendanceErrorFromSupabase(error, context);
    const interval = Array.isArray(data) ? data[0] : data;
    if (!interval) throw new AttendanceError("ATTENDANCE_REQUEST_FAILED", context);

    revalidatePath("/attendance");
    revalidatePath("/attendance/review");
    await recordProductMilestone({
      organizationId: context.organizationId,
      eventName: action === "attendance.check_in" ? "attendance.checked_in" : "attendance.clocked_out",
      workflowArea: "attendance",
      resultCategory: "success",
      occurrenceIdentity: `${interval.id}:${interval.status}`,
      analyticsProfileId: context.profile?.id,
    });
    return {
      success: true,
      message: successMessage,
      interval: {
        id: interval.attendance_id,
        status: interval.attendance_status,
        clockIn: interval.clock_in_at,
        clockOut: interval.clock_out_at,
      },
    };
  } catch (error) {
    const safe = error instanceof AttendanceError
      ? error
      : new AttendanceError("ATTENDANCE_REQUEST_FAILED", { cause: error });
    reportAttendanceFailure(safe, {
      action,
      organizationId: context?.organizationId,
      employeeId: context?.employeeId,
    });
    return { success: false, issue: serializeAttendanceError(safe) };
  }
}

export async function checkInAttendance() {
  return runAttendanceMutation({
    action: "attendance.check_in",
    rpc: "attendance_check_in",
    successMessage: "You are checked in.",
  });
}

export async function clockOutAttendance() {
  return runAttendanceMutation({
    action: "attendance.clock_out",
    rpc: "attendance_clock_out",
    successMessage: "You are checked out.",
  });
}
