import { TimeOffError } from "./config";

const TYPES = new Set(["paid", "unpaid", "sick", "other"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).replace(/\r\n?/g, "\n").trim();
  if (!normalized) return null;
  if (/[\u0000\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(normalized)) throw new Error("invalid text");
  return normalized;
}

export function validateRequestInput(input) {
  const startDate = input?.startDate;
  const endDate = input?.endDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(endDate ?? "") || endDate < startDate) throw new TimeOffError("TIME_OFF_INVALID_DATE_RANGE");
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || new Date(start).toISOString().slice(0, 10) !== startDate || new Date(end).toISOString().slice(0, 10) !== endDate) throw new TimeOffError("TIME_OFF_INVALID_DATE_RANGE");
  const days = Math.round((end - start) / 86400000) + 1;
  if (days < 1 || days > 366) throw new TimeOffError("TIME_OFF_INVALID_DATE_RANGE");
  if (!TYPES.has(input?.leaveType)) throw new TimeOffError("TIME_OFF_INVALID_TYPE");
  const reason = normalizeText(input?.reason);
  if (reason && reason.length > 500) throw new TimeOffError("TIME_OFF_INVALID_REASON");
  return { startDate, endDate, leaveType: input.leaveType, reason, calendarDays: days };
}

export function assertRetryRequestId(value) {
  if (!UUID_PATTERN.test(value ?? "")) throw new TimeOffError("TIME_OFF_INVALID_RETRY_ID");
  return value;
}

export function formatLeaveRequest(row) {
  return {
    id: row.id,
    leaveType: row.leave_type ?? row.leaveType,
    startDate: row.start_date ?? row.startDate,
    endDate: row.end_date ?? row.endDate,
    status: row.status,
    reason: row.reason ?? null,
    version: row.version ?? 1,
    submittedAt: row.submitted_at ?? row.submittedAt ?? null,
    decisionAt: row.decision_at ?? row.decisionAt ?? null,
    cancelledAt: row.cancelled_at ?? row.cancelledAt ?? null,
  };
}
