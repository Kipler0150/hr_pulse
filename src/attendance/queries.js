import { requireAttendanceContext } from "./access";
import { AttendanceError, attendanceErrorFromSupabase } from "./errors";
import {
  ATTENDANCE_PAGE_SIZE,
  decodeAttendanceCursor,
  encodeAttendanceCursor,
  parseReviewDate,
  presentAttendanceInterval,
} from "./format";
import { reportAttendanceFailure } from "./telemetry";
import { isTimeOffEnabled } from "@/time-off/config";

const INTERVAL_FIELDS = "id,employee_id,clock_in,clock_out,source,status";
const REVIEW_FIELDS = `${INTERVAL_FIELDS},employees!inner(id,organization_id,legal_name,preferred_name)`;

function reportUnexpected(error, context) {
  const safe = error instanceof AttendanceError ? error : new AttendanceError("ATTENDANCE_REQUEST_FAILED", { cause: error });
  reportAttendanceFailure(safe, context);
}

async function getDayContext(supabase, organizationId, requestedDate) {
  const { data, error } = await supabase
    .rpc("attendance_day_context", {
      target_organization_id: organizationId,
      requested_date: requestedDate,
    })
    .single();
  if (error) throw attendanceErrorFromSupabase(error, { organizationId });
  if (!data) throw new AttendanceError("ATTENDANCE_REQUEST_FAILED", { organizationId });
  return {
    date: data.local_date,
    timezone: data.organization_timezone,
    utcStart: data.utc_start,
    utcEnd: data.utc_end,
  };
}

function addCursor(query, cursor) {
  if (!cursor) return query;
  return query.or(`clock_in.lt.${cursor.clockIn},and(clock_in.eq.${cursor.clockIn},id.lt.${cursor.id})`);
}

function pageResult(rows) {
  const visibleRows = rows.slice(0, ATTENDANCE_PAGE_SIZE);
  const last = visibleRows.at(-1);
  return {
    nextCursor: rows.length > ATTENDANCE_PAGE_SIZE && last
      ? encodeAttendanceCursor(last.clock_in, last.id)
      : null,
    rows: visibleRows.map(presentAttendanceInterval),
  };
}

function intervalOverlapsDay(interval, day) {
  const start = Date.parse(interval.clock_in ?? interval.corrected_clock_in);
  const end = Date.parse(interval.clock_out ?? interval.corrected_clock_out);
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    && start < Date.parse(day.utcEnd) && end > Date.parse(day.utcStart);
}

function latestCorrections(rows) {
  return (rows ?? []).reduce((latest, correction) => {
    const current = latest.get(correction.attendance_interval_id);
    if (!current || correction.created_at > current.created_at || (correction.created_at === current.created_at && correction.id > current.id)) latest.set(correction.attendance_interval_id, correction);
    return latest;
  }, new Map());
}

async function getApprovedLeaveMarkers(context, day, employeeId = null) {
  if (!isTimeOffEnabled()) return { markers: [], available: true };
  try {
    if (process.env.HR_PULSE_VERIFY_LEAVE_FAILURE === "true" && process.env.NODE_ENV !== "production") throw new Error("CONTROLLED_LEAVE_MARKER_FAILURE");
    let markersQuery = context.supabase
      .from("leave_requests")
      .select("id,employee_id,start_date,end_date,leave_type,employees!inner(legal_name,preferred_name,organization_id)")
      .eq("organization_id", context.organizationId)
      .eq("status", "approved")
      .lte("start_date", day.date)
      .gte("end_date", day.date);
    if (employeeId) markersQuery = markersQuery.eq("employee_id", employeeId);
    const { data: markers, error: markerError } = await markersQuery;
    if (markerError) throw markerError;

    const employeeIds = [...new Set((markers ?? []).map((marker) => marker.employee_id))];
    if (employeeIds.length === 0) return { markers: [], available: true };
    const { data: originalIntervals, error: originalError } = await context.supabase
      .from("attendance_intervals")
      .select("id,employee_id,clock_in,clock_out")
      .in("employee_id", employeeIds)
      .lt("clock_in", day.utcEnd)
      .or(`clock_out.gt.${day.utcStart},clock_out.is.null`);
    if (originalError) throw originalError;
    const { data: overlappingCorrections, error: correctionError } = await context.supabase
      .from("attendance_interval_corrections")
      .select("id,attendance_interval_id,attendance_intervals!inner(employee_id)")
      .eq("organization_id", context.organizationId)
      .in("attendance_intervals.employee_id", employeeIds)
      .lt("corrected_clock_in", day.utcEnd)
      .gt("corrected_clock_out", day.utcStart)
      .limit(500);
    if (correctionError) throw correctionError;

    const knownIds = new Set((originalIntervals ?? []).map((interval) => interval.id));
    const candidateIds = [...new Set([...knownIds, ...(overlappingCorrections ?? []).map((correction) => correction.attendance_interval_id)])];
    const missingIntervalIds = candidateIds.filter((id) => !knownIds.has(id));
    let correctedIntervals = [];
    if (missingIntervalIds.length > 0) {
      const { data, error } = await context.supabase
        .from("attendance_intervals")
        .select("id,employee_id,clock_in,clock_out")
        .in("id", missingIntervalIds);
      if (error) throw error;
      correctedIntervals = data ?? [];
    }
    const candidateIntervals = [...(originalIntervals ?? []), ...correctedIntervals];
    const { data: corrections, error: latestCorrectionError } = await context.supabase
      .from("attendance_interval_corrections")
      .select("id,attendance_interval_id,corrected_clock_in,corrected_clock_out,created_at")
      .in("attendance_interval_id", candidateIds)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (latestCorrectionError) throw latestCorrectionError;
    const correctionsByInterval = latestCorrections(corrections);
    const workedEmployeeIds = new Set(candidateIntervals.filter((interval) => {
      const correction = correctionsByInterval.get(interval.id);
      return intervalOverlapsDay(correction ?? interval, day);
    }).map((interval) => interval.employee_id));
    return {
      available: true,
      markers: (markers ?? []).map((marker) => ({
        id: marker.id,
        employeeId: marker.employee_id,
        employeeName: marker.employees?.preferred_name || marker.employees?.legal_name || null,
        leaveType: marker.leave_type,
        startDate: marker.start_date,
        endDate: marker.end_date,
        workedDuringLeave: workedEmployeeIds.has(marker.employee_id),
      })),
    };
  } catch (error) {
    reportUnexpected(error, { ...context, action: "time_off.attendance_markers" });
    return { markers: [], available: false };
  }
}

export async function getEmployeeAttendance({ cursor: cursorValue } = {}) {
  const context = await requireAttendanceContext();
  const cursor = cursorValue ? decodeAttendanceCursor(cursorValue) : null;
  if (cursorValue && !cursor) throw new AttendanceError("INVALID_ATTENDANCE_CURSOR");

  try {
    const day = await getDayContext(context.supabase, context.organizationId, null);
    let intervalsQuery = context.supabase
      .from("attendance_intervals")
      .select(INTERVAL_FIELDS)
      .eq("employee_id", context.employeeId)
      .gte("clock_in", day.utcStart)
      .lt("clock_in", day.utcEnd)
      .order("clock_in", { ascending: false })
      .order("id", { ascending: false })
      .limit(ATTENDANCE_PAGE_SIZE + 1);
    intervalsQuery = addCursor(intervalsQuery, cursor);

    const [intervalsResult, openResult] = await Promise.all([
      intervalsQuery,
      context.supabase
        .from("attendance_intervals")
        .select(INTERVAL_FIELDS)
        .eq("employee_id", context.employeeId)
        .eq("status", "open")
        .maybeSingle(),
    ]);
    if (intervalsResult.error) throw attendanceErrorFromSupabase(intervalsResult.error, context);
    if (openResult.error) throw attendanceErrorFromSupabase(openResult.error, context);

    const leave = await getApprovedLeaveMarkers(context, day, context.employeeId);
    return {
      context,
      day,
      openInterval: openResult.data ? presentAttendanceInterval(openResult.data) : null,
      leave,
      ...pageResult(intervalsResult.data ?? []),
    };
  } catch (error) {
    reportUnexpected(error, { ...context, action: "attendance.employee_read" });
    throw error;
  }
}

export async function getAttendanceReview({ cursor: cursorValue, date: dateValue } = {}) {
  const context = await requireAttendanceContext({ review: true });
  const date = parseReviewDate(dateValue);
  if (dateValue && !date) throw new AttendanceError("INVALID_REVIEW_DATE");
  const cursor = cursorValue ? decodeAttendanceCursor(cursorValue) : null;
  if (cursorValue && !cursor) throw new AttendanceError("INVALID_ATTENDANCE_CURSOR");

  try {
    const day = await getDayContext(context.supabase, context.organizationId, date);
    let query = context.supabase
      .from("attendance_intervals")
      .select(REVIEW_FIELDS)
      .eq("employees.organization_id", context.organizationId)
      .gte("clock_in", day.utcStart)
      .lt("clock_in", day.utcEnd)
      .order("clock_in", { ascending: false })
      .order("id", { ascending: false })
      .limit(ATTENDANCE_PAGE_SIZE + 1);
    query = addCursor(query, cursor);
    const { data, error } = await query;
    if (error) throw attendanceErrorFromSupabase(error, context);

    const leave = await getApprovedLeaveMarkers(context, day);
    return { context, day, leave, ...pageResult(data ?? []) };
  } catch (error) {
    reportUnexpected(error, { ...context, action: "attendance.review_read" });
    throw error;
  }
}
