const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export const OVERTIME_FLAG = "HR_PULSE_OVERTIME_TIMECARDS_ENABLED";
export const TIMECARD_PAGE_SIZE = 50;
export const OVERTIME_CALCULATION_VERSION = "overtime-v1";

export function isOvertimeEnabled() {
  return TRUE_VALUES.has(String(process.env[OVERTIME_FLAG] ?? "").trim().toLowerCase());
}

export function getOvertimeReleaseState() {
  return { enabled: isOvertimeEnabled(), flag: OVERTIME_FLAG };
}

export function assertOvertimeEnabled() {
  if (!isOvertimeEnabled()) throw new Error("OVERTIME_DISABLED");
}
