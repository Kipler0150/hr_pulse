const DISPLAY_LOCALE = "en-PH";
const EMPTY_VALUE = "—";

export function formatMoney(minorUnits, currency) {
  if (minorUnits === null || minorUnits === undefined) return EMPTY_VALUE;
  if (!Number.isSafeInteger(minorUnits) || typeof currency !== "string") return EMPTY_VALUE;

  try {
    const formatter = new Intl.NumberFormat(DISPLAY_LOCALE, {
      currency: currency.toUpperCase(),
      style: "currency",
    });
    const fractionDigits = formatter.resolvedOptions().maximumFractionDigits;
    return formatter.format(minorUnits / (10 ** fractionDigits));
  } catch {
    return EMPTY_VALUE;
  }
}

export function formatDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return EMPTY_VALUE;

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
  ) return EMPTY_VALUE;

  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

export function formatInstant(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE;

  try {
    return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      timeZone,
      timeZoneName: "short",
      year: "numeric",
    }).format(date);
  } catch {
    return EMPTY_VALUE;
  }
}

export function formatDateRange(start, end) {
  const formattedStart = formatDateOnly(start);
  const formattedEnd = formatDateOnly(end);
  if (formattedStart === EMPTY_VALUE || formattedEnd === EMPTY_VALUE) return EMPTY_VALUE;
  return `${formattedStart} to ${formattedEnd}`;
}

export function formatRole(role) {
  if (typeof role !== "string" || !role.trim()) return "Member";
  return role.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
