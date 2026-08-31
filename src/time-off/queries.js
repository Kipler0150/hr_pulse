import { TimeOffError } from "./config";
import { formatLeaveRequest } from "./domain";

const PAGE_SIZE = 50;
const STATUS_VALUES = new Set(["submitted", "approved", "declined", "cancelled"]);

function mapRow(row) {
  const request = formatLeaveRequest(row);
  return { ...request, calendarDays: Math.round((Date.parse(`${request.endDate}T00:00:00Z`) - Date.parse(`${request.startDate}T00:00:00Z`)) / 86400000) + 1 };
}

function encodeCursor(cursor) { return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url"); }

function decodeCursor(value, expected) {
  if (!value) return null;
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (cursor?.v !== 1 || cursor?.direction !== expected.direction || typeof cursor.submittedAt !== "string" || !/^[0-9a-f-]{36}$/i.test(cursor.id ?? "") || cursor.fingerprint !== expected.fingerprint) throw new Error("invalid cursor");
    return cursor;
  } catch { throw new TimeOffError("TIME_OFF_INVALID_CURSOR"); }
}

function normalizeFilters({ status, startDate, endDate, employeeId } = {}, { defaultStatus = null } = {}) {
  const filters = { status: status || defaultStatus, startDate: startDate || null, endDate: endDate || null, employeeId: employeeId || null };
  if (filters.status && !STATUS_VALUES.has(filters.status)) throw new TimeOffError("TIME_OFF_INVALID_FILTER");
  for (const date of [filters.startDate, filters.endDate]) {
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) throw new TimeOffError("TIME_OFF_INVALID_FILTER");
  }
  if (filters.startDate && filters.endDate && filters.endDate < filters.startDate) throw new TimeOffError("TIME_OFF_INVALID_FILTER");
  return filters;
}

function filterFingerprint(filters) { return Buffer.from(JSON.stringify(filters), "utf8").toString("base64url"); }

function applyDateOverlap(query, filters) {
  if (filters.endDate) query = query.lte("start_date", filters.endDate);
  if (filters.startDate) query = query.gte("end_date", filters.startDate);
  return query;
}

function applyCursor(query, cursor, direction) {
  if (!cursor) return query;
  const operator = direction === "desc" ? "lt" : "gt";
  return query.or(`submitted_at.${operator}.${cursor.submittedAt},and(submitted_at.eq.${cursor.submittedAt},id.${operator}.${cursor.id})`);
}

function getNextCursor(rows, filters, direction) {
  if (rows.length <= PAGE_SIZE) return null;
  const last = rows[PAGE_SIZE - 1];
  return encodeCursor({ v: 1, direction, submittedAt: last.submitted_at, id: last.id, fingerprint: filterFingerprint(filters) });
}

export async function getEmployeeLeaveRequests({ context, cursor, status, startDate, endDate } = {}) {
  if (!context?.supabase || !context.employeeId) throw new TimeOffError("TIME_OFF_FORBIDDEN");
  const filters = normalizeFilters({ status, startDate, endDate });
  const decoded = decodeCursor(cursor, { direction: "desc", fingerprint: filterFingerprint(filters) });
  let query = context.supabase.from("leave_requests").select("id,employee_id,start_date,end_date,leave_type,reason,status,reviewer_profile_id,submitted_at,decision_at,cancelled_at,version").eq("organization_id", context.organizationId).eq("employee_id", context.employeeId).neq("status", "draft").order("submitted_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE_SIZE + 1);
  if (filters.status) query = query.eq("status", filters.status);
  query = applyDateOverlap(query, filters);
  query = applyCursor(query, decoded, "desc");
  const { data, error } = await query;
  if (error) throw new TimeOffError("TIME_OFF_REQUEST_FAILED", { cause: error });
  return { rows: (data ?? []).slice(0, PAGE_SIZE).map(mapRow), nextCursor: getNextCursor(data ?? [], filters, "desc") };
}

export async function getLeaveReviewQueue({ context, status = "submitted", cursor, startDate, endDate, employeeId } = {}) {
  if (!context?.supabase || !["manager", "administrator"].includes(context.membership.role)) throw new TimeOffError("TIME_OFF_FORBIDDEN");
  if (context.membership.role === "manager" && !context.employeeId) throw new TimeOffError("TIME_OFF_FORBIDDEN");
  const filters = normalizeFilters({ status, startDate, endDate, employeeId }, { defaultStatus: "submitted" });
  const decoded = decodeCursor(cursor, { direction: "asc", fingerprint: filterFingerprint(filters) });
  let query = context.supabase.from("leave_requests").select("id,employee_id,start_date,end_date,leave_type,status,submitted_at,decision_at,cancelled_at,version,employees!inner(employee_number,legal_name,preferred_name,organization_id,manager_id)").eq("organization_id", context.organizationId).eq("status", filters.status).order("submitted_at", { ascending: true }).order("id", { ascending: true }).limit(PAGE_SIZE + 1);
  if (context.membership.role === "manager") query = query.eq("employees.manager_id", context.employeeId);
  if (filters.employeeId) query = query.eq("employee_id", filters.employeeId);
  query = applyDateOverlap(query, filters);
  query = applyCursor(query, decoded, "asc");
  const { data, error } = await query;
  if (error) throw new TimeOffError("TIME_OFF_REQUEST_FAILED", { cause: error });
  return { rows: (data ?? []).slice(0, PAGE_SIZE).map((row) => ({ ...mapRow(row), employeeId: row.employee_id, employeeNumber: row.employees?.employee_number, employeeName: row.employees?.preferred_name || row.employees?.legal_name })), nextCursor: getNextCursor(data ?? [], filters, "asc") };
}

export async function getLeaveRequestDetail({ context, requestId } = {}) {
  if (!context?.supabase || !requestId) throw new TimeOffError("TIME_OFF_UNAVAILABLE");
  const { data, error } = await context.supabase.rpc("get_leave_request_detail", { target_organization_id: context.organizationId, target_request_id: requestId });
  if (error) throw new TimeOffError("TIME_OFF_UNAVAILABLE", { cause: error });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new TimeOffError("TIME_OFF_UNAVAILABLE");
  return row;
}
