const DAY_MS = 86_400_000;

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(value) {
  return value.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function daysBetween(left, right) {
  return Math.floor((parseDate(right).getTime() - parseDate(left).getTime()) / DAY_MS);
}

function monthPeriod(year, month) {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  return { periodStart: formatDate(start), periodEnd: formatDate(end) };
}

export function getOrganizationLocalDate(timezone, instant = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getPeriodContaining(schedule, date) {
  const target = parseDate(date);
  if (schedule.frequency === "weekly" || schedule.frequency === "biweekly") {
    const length = schedule.frequency === "weekly" ? 7 : 14;
    if (!schedule.anchorStartDate) throw new Error("anchorStartDate is required for anchored payroll schedules");
    const offset = Math.floor(daysBetween(schedule.anchorStartDate, date) / length) * length;
    const periodStart = addDays(schedule.anchorStartDate, offset);
    return { periodStart, periodEnd: addDays(periodStart, length - 1) };
  }
  if (schedule.frequency === "semimonthly") {
    const year = target.getUTCFullYear();
    const month = target.getUTCMonth();
    const day = target.getUTCDate();
    if (day <= 15) return { periodStart: formatDate(new Date(Date.UTC(year, month, 1))), periodEnd: formatDate(new Date(Date.UTC(year, month, 15))) };
    return { periodStart: formatDate(new Date(Date.UTC(year, month, 16))), periodEnd: formatDate(new Date(Date.UTC(year, month + 1, 0))) };
  }
  if (schedule.frequency === "monthly") return monthPeriod(target.getUTCFullYear(), target.getUTCMonth());
  throw new Error("unsupported payroll frequency");
}

export function getNextPeriod(schedule, latestCompletedPeriodEnd = null, organizationToday) {
  if (latestCompletedPeriodEnd) return getPeriodContaining(schedule, addDays(latestCompletedPeriodEnd, 1));
  const yesterday = addDays(organizationToday, -1);
  let period = getPeriodContaining(schedule, yesterday);
  if (period.periodEnd >= organizationToday) {
    period = getPeriodContaining(schedule, addDays(period.periodStart, -1));
  }
  if (period.periodStart < schedule.effectiveStartDate) {
    const first = getPeriodContaining(schedule, schedule.effectiveStartDate);
    if (first.periodStart !== schedule.effectiveStartDate) throw new Error("schedule effective start must align with a period boundary");
    period = first;
  }
  if (period.periodEnd >= organizationToday) throw new Error("no closed payroll period is available");
  return period;
}

export function isClosedPeriod(period, organizationToday) {
  return period.periodEnd < organizationToday;
}

export function nextDate(value) {
  return addDays(value, 1);
}
