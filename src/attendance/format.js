export const ATTENDANCE_PAGE_SIZE = 50;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getDurationMinutes(clockIn, clockOut) {
  if (!clockOut) return null;
  const start = new Date(clockIn).getTime();
  const end = new Date(clockOut).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.floor((end - start) / 60_000);
}

export function formatDuration(minutes) {
  if (!Number.isSafeInteger(minutes) || minutes < 0) return "In progress";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${remainder}m`;
}

export function isLongAttendanceInterval(minutes) {
  return Number.isSafeInteger(minutes) && minutes > 24 * 60;
}

export function encodeAttendanceCursor(clockIn, id) {
  return Buffer.from(JSON.stringify({ clockIn, id }), "utf8").toString("base64url");
}

export function decodeAttendanceCursor(value) {
  if (!value || typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const clockIn = new Date(parsed?.clockIn);
    if (!UUID_PATTERN.test(parsed?.id ?? "") || Number.isNaN(clockIn.getTime())) return null;
    return { clockIn: clockIn.toISOString(), id: parsed.id };
  } catch {
    return null;
  }
}

export function parseReviewDate(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    date.getUTCFullYear() !== Number(match[1])
    || date.getUTCMonth() !== Number(match[2]) - 1
    || date.getUTCDate() !== Number(match[3])
  ) return null;
  return value;
}

export function presentAttendanceInterval(row) {
  const clockIn = row.clock_in ?? row.clockIn;
  const clockOut = row.clock_out ?? row.clockOut ?? null;
  const minutes = getDurationMinutes(clockIn, clockOut);
  const employee = row.employees ?? row.employee ?? null;
  return {
    id: row.id,
    employeeId: row.employee_id ?? row.employeeId,
    employeeName: employee ? (employee.preferred_name || employee.legal_name) : null,
    clockIn,
    clockOut,
    status: row.status,
    durationMinutes: minutes,
    duration: formatDuration(minutes),
    longInterval: isLongAttendanceInterval(minutes),
  };
}
