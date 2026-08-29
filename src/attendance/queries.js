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

    return {
      context,
      day,
      openInterval: openResult.data ? presentAttendanceInterval(openResult.data) : null,
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

    return { context, day, ...pageResult(data ?? []) };
  } catch (error) {
    reportUnexpected(error, { ...context, action: "attendance.review_read" });
    throw error;
  }
}
