const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const PAY_FREQUENCIES = new Set(["weekly", "biweekly", "semimonthly", "monthly"]);

export function validateUuid(value, field = "id") {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`${field} must be a valid UUID`);
  }
  return value;
}

export function validateDate(value, field = "date") {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw new Error(`${field} must use YYYY-MM-DD format`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${field} must be a real calendar date`);
  }
  return value;
}

export function validateTimestamp(value, field = "timestamp") {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${field} must be a valid UTC timestamp`);
  }
  return parsed;
}

export function validateCurrency(value, field = "currency") {
  if (typeof value !== "string" || !CURRENCY_PATTERN.test(value)) {
    throw new Error(`${field} must be an ISO 4217 currency code`);
  }
  return value;
}

export function validateTimezone(value, field = "timezone") {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
  } catch {
    throw new Error(`${field} must be a valid IANA timezone`);
  }
  return value;
}

export function validatePayFrequency(value, field = "payFrequency") {
  if (!PAY_FREQUENCIES.has(value)) throw new Error(`${field} must be a supported payroll frequency`);
  return value;
}

export function validateMinorAmount(value, field = "amount") {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a nonnegative integer minor unit amount`);
  }
  return value;
}

export function validatePositiveMinorAmount(value, field = "amount") {
  validateMinorAmount(value, field);
  if (value === 0) throw new Error(`${field} must be greater than zero`);
  return value;
}

export function validateDeductionLines(lines) {
  if (!Array.isArray(lines)) throw new Error("deductions must be an array");
  const names = new Set();
  return lines.map((line, index) => {
    const name = String(line?.name ?? "").trim();
    if (!name) throw new Error(`deductions[${index}].name is required`);
    const normalized = name.toLocaleLowerCase("en");
    if (names.has(normalized)) throw new Error("deduction names must be unique without regard to case");
    names.add(normalized);
    return {
      name,
      amountMinor: validatePositiveMinorAmount(Number(line.amountMinor), `deductions[${index}].amountMinor`),
      displayOrder: index,
    };
  });
}

export function encodeCursor(values) {
  return Buffer.from(JSON.stringify(values), "utf8").toString("base64url");
}

export function decodeCursor(value, expectedLength = 2) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== expectedLength || parsed.some((part) => typeof part !== "string")) throw new Error();
    return parsed;
  } catch {
    throw new Error("cursor is invalid");
  }
}

export function validateDateRange(startDate, endDate) {
  validateDate(startDate, "startDate");
  validateDate(endDate, "endDate");
  if (endDate < startDate) {
    throw new Error("endDate must be on or after startDate");
  }
  return { startDate, endDate };
}

export function validatePayoutAmounts(grossAmountMinor, deductionsAmountMinor, netAmountMinor) {
  validateMinorAmount(grossAmountMinor, "grossAmountMinor");
  validateMinorAmount(deductionsAmountMinor, "deductionsAmountMinor");
  validateMinorAmount(netAmountMinor, "netAmountMinor");
  if (netAmountMinor !== grossAmountMinor - deductionsAmountMinor) {
    throw new Error("netAmountMinor must equal grossAmountMinor minus deductionsAmountMinor");
  }
  return { grossAmountMinor, deductionsAmountMinor, netAmountMinor };
}
