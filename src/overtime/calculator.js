const MAX_INTERVAL_SECONDS = 24 * 60 * 60;

function asDate(value, field) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} is invalid`);
  return date;
}

function secondsBetween(start, end) {
  const milliseconds = end.getTime() - start.getTime();
  if (milliseconds <= 0 || milliseconds % 1000 !== 0) throw new Error("interval timestamps must have positive whole second precision");
  return milliseconds / 1000;
}

function roundHalfUp(numerator, denominator) {
  if (denominator <= 0n || numerator < 0n) throw new Error("invalid rational value");
  return (numerator * 2n + denominator) / (denominator * 2n);
}

function safeNumber(value, field) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${field} exceeds the safe integer range`);
  return number;
}

export function calculateOvertimeAmount({ baseGrossAmountMinor, payableOvertimeMinutes, multiplierBasisPoints, standardPeriodMinutes }) {
  const numerator = BigInt(baseGrossAmountMinor) * BigInt(payableOvertimeMinutes) * BigInt(multiplierBasisPoints);
  const denominator = BigInt(standardPeriodMinutes) * 10_000n;
  return safeNumber(roundHalfUp(numerator, denominator), "overtime amount");
}

export function allocateDailyOvertimeMoney({ baseGrossAmountMinor, multiplierBasisPoints, standardPeriodMinutes, periodAmountMinor, days }) {
  if (periodAmountMinor === 0) return days.map((day) => ({ ...day, overtimeAmountMinor: 0 }));
  const denominator = BigInt(standardPeriodMinutes) * 10_000n;
  const allocations = days.map((day) => {
    const numerator = BigInt(baseGrossAmountMinor) * BigInt(day.payableOvertimeMinutes) * BigInt(multiplierBasisPoints);
    return { ...day, overtimeAmountMinor: safeNumber(numerator / denominator, "daily overtime amount"), remainder: numerator % denominator };
  });
  let remaining = periodAmountMinor - allocations.reduce((total, day) => total + day.overtimeAmountMinor, 0);
  const ranked = [...allocations].sort((left, right) => {
    if (left.remainder === right.remainder) return left.localDate.localeCompare(right.localDate);
    return left.remainder > right.remainder ? -1 : 1;
  });
  for (let index = 0; index < remaining; index += 1) ranked[index % ranked.length].overtimeAmountMinor += 1;
  return allocations.map(({ remainder, ...day }) => day);
}

export function calculateTimecard({ days, intervals, dailyThresholdMinutes, policyEnabled, overtimeEligible, baseGrossAmountMinor, standardPeriodMinutes, multiplierBasisPoints, currency }) {
  if (!Number.isInteger(dailyThresholdMinutes) || dailyThresholdMinutes < 1 || dailyThresholdMinutes > 1440) throw new Error("daily threshold must be from 1 through 1440 minutes");
  if (!Array.isArray(days) || days.length === 0) throw new Error("timecard days are required");
  if ((policyEnabled && overtimeEligible) && (!Number.isInteger(standardPeriodMinutes) || standardPeriodMinutes < 1 || !Number.isInteger(multiplierBasisPoints) || multiplierBasisPoints < 10_000 || multiplierBasisPoints > 50_000)) throw new Error("enabled overtime inputs are invalid");

  const normalizedDays = days.map((day) => ({
    localDate: day.localDate,
    utcStart: asDate(day.utcStart, "day start"),
    utcEnd: asDate(day.utcEnd, "day end"),
    workedSeconds: 0,
    sources: [],
  }));
  const normalizedIntervals = intervals.map((interval) => {
    const clockIn = asDate(interval.clockIn, "clock in");
    const clockOut = asDate(interval.clockOut, "clock out");
    const duration = secondsBetween(clockIn, clockOut);
    if (duration > MAX_INTERVAL_SECONDS) throw new Error("attendance interval cannot exceed 24 hours");
    return { ...interval, clockIn, clockOut, duration };
  }).sort((left, right) => left.clockIn - right.clockIn || left.clockOut - right.clockOut);

  for (let index = 1; index < normalizedIntervals.length; index += 1) {
    if (normalizedIntervals[index].clockIn < normalizedIntervals[index - 1].clockOut) throw new Error("attendance intervals cannot overlap");
  }

  for (const interval of normalizedIntervals) {
    let allocated = 0;
    for (const day of normalizedDays) {
      const start = new Date(Math.max(interval.clockIn.getTime(), day.utcStart.getTime()));
      const end = new Date(Math.min(interval.clockOut.getTime(), day.utcEnd.getTime()));
      if (end <= start) continue;
      const allocatedSeconds = secondsBetween(start, end);
      allocated += allocatedSeconds;
      day.workedSeconds += allocatedSeconds;
      day.sources.push({
        attendanceIntervalId: interval.id,
        attendanceIntervalCorrectionId: interval.correctionId ?? null,
        clockInSnapshot: interval.clockIn,
        clockOutSnapshot: interval.clockOut,
        allocatedSeconds,
      });
    }
    const periodStart = normalizedDays[0].utcStart;
    const periodEnd = normalizedDays.at(-1).utcEnd;
    const expected = secondsBetween(new Date(Math.max(interval.clockIn, periodStart)), new Date(Math.min(interval.clockOut, periodEnd)));
    if (allocated !== expected) throw new Error("attendance source allocation does not reconcile");
  }

  const thresholdSeconds = dailyThresholdMinutes * 60;
  let calculatedDays = normalizedDays.map(({ utcStart, utcEnd, ...day }) => {
    const overtimeSeconds = policyEnabled && overtimeEligible ? Math.max(0, day.workedSeconds - thresholdSeconds) : 0;
    return {
      ...day,
      regularSeconds: day.workedSeconds - overtimeSeconds,
      overtimeSeconds,
      payableOvertimeMinutes: Math.floor((overtimeSeconds + 30) / 60),
      overtimeAmountMinor: 0,
      currency,
    };
  });
  const payableOvertimeMinutes = calculatedDays.reduce((total, day) => total + day.payableOvertimeMinutes, 0);
  const overtimeAmountMinor = policyEnabled && overtimeEligible
    ? calculateOvertimeAmount({ baseGrossAmountMinor, payableOvertimeMinutes, multiplierBasisPoints, standardPeriodMinutes })
    : 0;
  calculatedDays = policyEnabled && overtimeEligible
    ? allocateDailyOvertimeMoney({ baseGrossAmountMinor, multiplierBasisPoints, standardPeriodMinutes, periodAmountMinor: overtimeAmountMinor, days: calculatedDays })
    : calculatedDays;
  const workedSeconds = calculatedDays.reduce((total, day) => total + day.workedSeconds, 0);
  const regularSeconds = calculatedDays.reduce((total, day) => total + day.regularSeconds, 0);
  const overtimeSeconds = calculatedDays.reduce((total, day) => total + day.overtimeSeconds, 0);
  return { days: calculatedDays, workedSeconds, regularSeconds, overtimeSeconds, payableOvertimeMinutes, overtimeAmountMinor };
}
