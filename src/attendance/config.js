import { AttendanceError } from "./errors";

export function isAttendanceEnabled() {
  if (process.env.ATTENDANCE_ENABLED === "true") return true;
  return process.env.NODE_ENV !== "production" && process.env.ATTENDANCE_ENABLED !== "false";
}

export function assertAttendanceEnabled() {
  if (!isAttendanceEnabled()) throw new AttendanceError("ATTENDANCE_DISABLED");
}

export function getAttendanceReleaseState() {
  return {
    enabled: isAttendanceEnabled(),
    syntheticDataOnly: true,
  };
}
