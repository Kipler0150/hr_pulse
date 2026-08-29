import { createHash } from "node:crypto";

import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  attendanceIntervalCorrections,
  attendanceIntervals,
  auditEvents,
  employees,
  memberships,
  mutationReceipts,
  organizations,
  overtimePolicies,
  paySettings,
  payoutEarningLines,
  payrollSchedules,
  profiles,
  timecardDaySources,
  timecardDays,
  timecardEvents,
  timecards,
} from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { getOrganizationLocalDate, getNextPeriod, getPeriodContaining, isClosedPeriod } from "@/payroll/periods";
import { normalizeDayBoundary } from "./boundaries";
import { calculateTimecard } from "./calculator";
import { TIMECARD_PAGE_SIZE } from "./config";
import { OvertimeError } from "./errors";

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}

function hashPayload(payload) {
  return createHash("sha256").update(JSON.stringify(stableValue(payload))).digest("hex");
}

function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeCursor(value) {
  if (!value) return null;
  try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")); } catch { throw new OvertimeError("OVERTIME_REQUEST_FAILED"); }
}

function displayName(employee) {
  return employee.preferredName || employee.legalName;
}

function assertExpectedVersion(card, expectedVersion) {
  if (!card || card.version !== expectedVersion) throw new OvertimeError("TIMECARD_STALE", { timecardId: card?.id });
}

async function existingReceipt(transaction, { organizationId, operation, requestId, payloadHash }) {
  const [receipt] = await transaction.select().from(mutationReceipts).where(and(
    eq(mutationReceipts.organizationId, organizationId),
    eq(mutationReceipts.operation, operation),
    eq(mutationReceipts.requestId, requestId),
  ));
  if (!receipt) return null;
  if (receipt.payloadHash !== payloadHash) throw new OvertimeError("TIMECARD_DUPLICATE_REQUEST");
  if (receipt.resultEntityType === "timecard") {
    const [card] = await transaction.select().from(timecards).where(eq(timecards.id, receipt.resultEntityId));
    return { receipt, card, duplicate: true };
  }
  if (receipt.resultEntityType === "overtime_policy") {
    const [policy] = await transaction.select().from(overtimePolicies).where(eq(overtimePolicies.id, receipt.resultEntityId));
    return { receipt, policy, duplicate: true };
  }
  if (receipt.resultEntityType === "attendance_correction") {
    const [correction] = await transaction.select().from(attendanceIntervalCorrections).where(eq(attendanceIntervalCorrections.id, receipt.resultEntityId));
    return { receipt, correction, duplicate: true };
  }
  throw new OvertimeError("OVERTIME_REQUEST_FAILED");
}

async function addReceipt(transaction, { context, operation, requestId, payloadHash, entityType, entityId, version }) {
  await transaction.insert(mutationReceipts).values({
    organizationId: context.organizationId,
    actorProfileId: context.profile.id,
    operation,
    requestId,
    payloadHash,
    resultEntityType: entityType,
    resultEntityId: entityId,
    resultVersion: version,
  });
}

async function lockOrganization(transaction, organizationId) {
  await transaction.execute(sql`SELECT id FROM organizations WHERE id = ${organizationId} FOR UPDATE`);
}

async function loadAuthorizedEmployee(transaction, context, employeeId, { selfOnly = false } = {}) {
  const [employee] = await transaction.select().from(employees).where(and(eq(employees.id, employeeId), eq(employees.organizationId, context.organizationId)));
  if (!employee) throw new OvertimeError("OVERTIME_FORBIDDEN");
  const isSelf = employee.profileId === context.profile.id;
  const isDirectReport = context.employeeId && employee.managerId === context.employeeId;
  if (selfOnly ? !isSelf : !(isSelf || isDirectReport || context.membership.role === "administrator")) throw new OvertimeError("OVERTIME_FORBIDDEN", { employeeId });
  return employee;
}

async function reviewerState(transaction, organizationId, employee) {
  let manager = null;
  if (employee.managerId) {
    [manager] = await transaction.select({ employee: employees, profile: profiles, membership: memberships })
      .from(employees)
      .innerJoin(profiles, and(eq(profiles.id, employees.profileId), eq(profiles.status, "active")))
      .innerJoin(memberships, and(eq(memberships.profileId, profiles.id), eq(memberships.organizationId, organizationId), eq(memberships.status, "active")))
      .where(and(eq(employees.id, employee.managerId), inArray(memberships.role, ["manager", "administrator"])));
  }
  const administrators = await transaction.select({ profileId: memberships.profileId }).from(memberships)
    .innerJoin(profiles, and(eq(profiles.id, memberships.profileId), eq(profiles.status, "active")))
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.status, "active"), eq(memberships.role, "administrator")));
  return { manager, administrators: administrators.filter((row) => row.profileId !== employee.profileId) };
}

async function dayBoundaries(transaction, period, timezone) {
  const result = await transaction.execute(sql`
    SELECT day::date::text AS local_date,
      day::timestamp AT TIME ZONE ${timezone} AS utc_start,
      (day + interval '1 day')::timestamp AT TIME ZONE ${timezone} AS utc_end
    FROM generate_series(${period.periodStart}::date, ${period.periodEnd}::date, interval '1 day') AS day
    ORDER BY day
  `);
  return [...result].map(normalizeDayBoundary);
}

async function effectivePolicy(transaction, organizationId, period) {
  const [policy] = await transaction.select().from(overtimePolicies)
    .where(and(eq(overtimePolicies.organizationId, organizationId), lte(overtimePolicies.effectiveFrom, period.periodStart)))
    .orderBy(desc(overtimePolicies.effectiveFrom)).limit(1);
  if (!policy) throw new OvertimeError("TIMECARD_MISSING_POLICY");
  const [next] = await transaction.select().from(overtimePolicies)
    .where(and(eq(overtimePolicies.organizationId, organizationId), gt(overtimePolicies.effectiveFrom, policy.effectiveFrom)))
    .orderBy(asc(overtimePolicies.effectiveFrom)).limit(1);
  if (next && next.effectiveFrom <= period.periodEnd) throw new OvertimeError("TIMECARD_MISSING_POLICY");
  return policy;
}

async function effectivePaySetting(transaction, employeeId, frequency, period) {
  const [setting] = await transaction.select().from(paySettings)
    .where(and(
      eq(paySettings.employeeId, employeeId),
      eq(paySettings.payFrequency, frequency),
      lte(paySettings.effectiveFrom, period.periodStart),
      or(isNull(paySettings.effectiveTo), gte(paySettings.effectiveTo, period.periodEnd)),
    )).orderBy(desc(paySettings.effectiveFrom), desc(paySettings.version)).limit(1);
  if (!setting) throw new OvertimeError("TIMECARD_MISSING_PAY");
  return setting;
}

async function intervalSnapshot(transaction, employeeId, boundaries) {
  const periodStart = boundaries[0].utcStart;
  const periodEnd = boundaries.at(-1).utcEnd;
  const rows = await transaction.select().from(attendanceIntervals).where(and(
    eq(attendanceIntervals.employeeId, employeeId),
    lt(attendanceIntervals.clockIn, periodEnd),
    or(isNull(attendanceIntervals.clockOut), gt(attendanceIntervals.clockOut, periodStart)),
  )).orderBy(asc(attendanceIntervals.clockIn), asc(attendanceIntervals.id));
  if (rows.some((row) => row.status === "open" || !row.clockOut)) throw new OvertimeError("TIMECARD_OPEN_INTERVAL", { employeeId });
  const ids = rows.map((row) => row.id);
  const corrections = ids.length === 0 ? [] : await transaction.select().from(attendanceIntervalCorrections)
    .where(inArray(attendanceIntervalCorrections.attendanceIntervalId, ids))
    .orderBy(desc(attendanceIntervalCorrections.createdAt), desc(attendanceIntervalCorrections.id));
  const latest = new Map();
  for (const correction of corrections) if (!latest.has(correction.attendanceIntervalId)) latest.set(correction.attendanceIntervalId, correction);
  return rows.map((row) => {
    const correction = latest.get(row.id);
    return { id: row.id, correctionId: correction?.id ?? null, clockIn: correction?.correctedClockIn ?? row.clockIn, clockOut: correction?.correctedClockOut ?? row.clockOut };
  });
}

async function buildSnapshot(transaction, context, employee, schedule, period) {
  const organizationToday = getOrganizationLocalDate(context.organization.timezone);
  const expected = getPeriodContaining(schedule, period.periodStart);
  if (expected.periodStart !== period.periodStart || expected.periodEnd !== period.periodEnd || !isClosedPeriod(period, organizationToday)) throw new OvertimeError("TIMECARD_ACTIVE_PERIOD");
  const [policy, setting, boundaries] = await Promise.all([
    effectivePolicy(transaction, context.organizationId, period),
    effectivePaySetting(transaction, employee.id, schedule.frequency, period),
    dayBoundaries(transaction, period, context.organization.timezone),
  ]);
  const intervals = await intervalSnapshot(transaction, employee.id, boundaries);
  let calculation;
  try {
    calculation = calculateTimecard({
      days: boundaries,
      intervals,
      dailyThresholdMinutes: policy.dailyThresholdMinutes,
      policyEnabled: policy.enabled,
      overtimeEligible: setting.overtimeEligible,
      baseGrossAmountMinor: setting.grossAmountMinor,
      standardPeriodMinutes: setting.standardPeriodMinutes,
      multiplierBasisPoints: setting.overtimeMultiplierBasisPoints,
      currency: setting.currency,
    });
  } catch (error) {
    throw new OvertimeError("TIMECARD_INVALID_INTERVAL", { employeeId: employee.id, cause: error });
  }
  return { policy, setting, calculation };
}

async function replaceEvidence(transaction, card, snapshot) {
  const existingDays = await transaction.select({ id: timecardDays.id }).from(timecardDays).where(eq(timecardDays.timecardId, card.id));
  if (existingDays.length > 0) {
    await transaction.delete(timecardDaySources).where(inArray(timecardDaySources.timecardDayId, existingDays.map((day) => day.id)));
    await transaction.delete(timecardDays).where(eq(timecardDays.timecardId, card.id));
  }
  for (const day of snapshot.calculation.days) {
    const [savedDay] = await transaction.insert(timecardDays).values({
      timecardId: card.id,
      localDate: day.localDate,
      workedSeconds: day.workedSeconds,
      regularSeconds: day.regularSeconds,
      overtimeSeconds: day.overtimeSeconds,
      payableOvertimeMinutes: day.payableOvertimeMinutes,
      overtimeAmountMinor: day.overtimeAmountMinor,
      currency: day.currency,
    }).returning();
    if (day.sources.length > 0) await transaction.insert(timecardDaySources).values(day.sources.map((source) => ({ ...source, timecardDayId: savedDay.id })));
  }
}

function snapshotValues(context, employee, schedule, period, snapshot) {
  return {
    organizationId: context.organizationId,
    employeeId: employee.id,
    payrollScheduleId: schedule.id,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    timezone: context.organization.timezone,
    overtimePolicyId: snapshot.policy.id,
    paySettingId: snapshot.setting.id,
    policyVersion: snapshot.policy.version,
    dailyThresholdMinutes: snapshot.policy.dailyThresholdMinutes,
    policyEnabled: snapshot.policy.enabled,
    overtimeEligible: snapshot.setting.overtimeEligible,
    standardPeriodMinutes: snapshot.setting.standardPeriodMinutes,
    overtimeMultiplierBasisPoints: snapshot.setting.overtimeMultiplierBasisPoints,
    baseGrossAmountMinor: snapshot.setting.grossAmountMinor,
    currency: snapshot.setting.currency,
    workedSeconds: snapshot.calculation.workedSeconds,
    regularSeconds: snapshot.calculation.regularSeconds,
    overtimeSeconds: snapshot.calculation.overtimeSeconds,
    payableOvertimeMinutes: snapshot.calculation.payableOvertimeMinutes,
    overtimeAmountMinor: snapshot.calculation.overtimeAmountMinor,
    updatedAt: new Date(),
  };
}

function evidenceSignature(sources) {
  return sources.map((source) => [
    source.attendanceIntervalId,
    source.attendanceIntervalCorrectionId ?? null,
    new Date(source.clockInSnapshot).toISOString(),
    new Date(source.clockOutSnapshot).toISOString(),
    source.allocatedSeconds,
  ].join(":" )).sort();
}

export async function prepareTimecard({ context, employeeId, period, expectedVersion = null, requestId }) {
  const operation = "timecard.prepare";
  const payloadHash = hashPayload({ employeeId, period, expectedVersion });
  const database = getDb();
  return database.transaction(async (transaction) => {
    const duplicate = await existingReceipt(transaction, { organizationId: context.organizationId, operation, requestId, payloadHash });
    if (duplicate) return duplicate;
    await lockOrganization(transaction, context.organizationId);
    const employee = await loadAuthorizedEmployee(transaction, context, employeeId);
    const [schedule] = await transaction.select().from(payrollSchedules).where(eq(payrollSchedules.organizationId, context.organizationId));
    if (!schedule) throw new OvertimeError("TIMECARD_MISSING_PAY");
    const snapshot = await buildSnapshot(transaction, context, employee, schedule, period);
    let [card] = await transaction.select().from(timecards).where(and(
      eq(timecards.organizationId, context.organizationId), eq(timecards.employeeId, employee.id), eq(timecards.payrollScheduleId, schedule.id),
      eq(timecards.periodStart, period.periodStart), eq(timecards.periodEnd, period.periodEnd),
    ));
    if (card && ["submitted", "approved"].includes(card.status)) {
      await addReceipt(transaction, { context, operation, requestId, payloadHash, entityType: "timecard", entityId: card.id, version: card.version });
      return { card, duplicate: false, frozen: true };
    }
    if (card && expectedVersion !== null) assertExpectedVersion(card, expectedVersion);
    const values = snapshotValues(context, employee, schedule, period, snapshot);
    const wasCreated = !card;
    if (card) {
      [card] = await transaction.update(timecards).set({ ...values, version: sql`${timecards.version} + 1` }).where(eq(timecards.id, card.id)).returning();
    } else {
      [card] = await transaction.insert(timecards).values({ ...values, status: "draft" }).returning();
    }
    await replaceEvidence(transaction, card, snapshot);
    await transaction.insert(timecardEvents).values({ organizationId: context.organizationId, timecardId: card.id, action: "prepared", actorProfileId: context.profile.id, priorStatus: wasCreated ? null : card.status, resultingStatus: card.status });
    await addReceipt(transaction, { context, operation, requestId, payloadHash, entityType: "timecard", entityId: card.id, version: card.version });
    await writeAuditEvent(transaction, { organizationId: context.organizationId, actorProfileId: context.profile.id, action: "timecard.prepared", entityType: "timecard", entityId: card.id, metadata: { employeeId, status: card.status, version: card.version } });
    return { card, duplicate: false, frozen: false };
  });
}

async function lockCard(transaction, context, timecardId) {
  await transaction.execute(sql`SELECT id FROM timecards WHERE id = ${timecardId} AND organization_id = ${context.organizationId} FOR UPDATE`);
  const [card] = await transaction.select().from(timecards).where(and(eq(timecards.id, timecardId), eq(timecards.organizationId, context.organizationId)));
  if (!card) throw new OvertimeError("TIMECARD_NOT_FOUND");
  return card;
}

export async function submitTimecard({ context, timecardId, expectedVersion, zeroHoursConfirmed, requestId }) {
  const operation = "timecard.submit";
  const payloadHash = hashPayload({ timecardId, expectedVersion, zeroHoursConfirmed });
  return getDb().transaction(async (transaction) => {
    const duplicate = await existingReceipt(transaction, { organizationId: context.organizationId, operation, requestId, payloadHash });
    if (duplicate) return duplicate;
    const card = await lockCard(transaction, context, timecardId);
    const employee = await loadAuthorizedEmployee(transaction, context, card.employeeId, { selfOnly: true });
    assertExpectedVersion(card, expectedVersion);
    if (!["draft", "returned"].includes(card.status)) throw new OvertimeError("TIMECARD_INVALID_STATE");
    if (card.workedSeconds === 0 && !zeroHoursConfirmed) throw new OvertimeError("TIMECARD_ZERO_CONFIRMATION");
    const [schedule] = await transaction.select().from(payrollSchedules).where(eq(payrollSchedules.id, card.payrollScheduleId));
    const current = await buildSnapshot(transaction, context, employee, schedule, { periodStart: card.periodStart, periodEnd: card.periodEnd });
    const persistedSources = await transaction.select({
      attendanceIntervalId: timecardDaySources.attendanceIntervalId,
      attendanceIntervalCorrectionId: timecardDaySources.attendanceIntervalCorrectionId,
      clockInSnapshot: timecardDaySources.clockInSnapshot,
      clockOutSnapshot: timecardDaySources.clockOutSnapshot,
      allocatedSeconds: timecardDaySources.allocatedSeconds,
    }).from(timecardDaySources)
      .innerJoin(timecardDays, eq(timecardDays.id, timecardDaySources.timecardDayId))
      .where(eq(timecardDays.timecardId, card.id));
    const persistedSignature = evidenceSignature(persistedSources);
    const currentSignature = evidenceSignature(current.calculation.days.flatMap((day) => day.sources));
    if (current.policy.id !== card.overtimePolicyId || current.setting.id !== card.paySettingId
      || current.calculation.workedSeconds !== card.workedSeconds || current.calculation.regularSeconds !== card.regularSeconds
      || current.calculation.overtimeSeconds !== card.overtimeSeconds || current.calculation.payableOvertimeMinutes !== card.payableOvertimeMinutes
      || current.calculation.overtimeAmountMinor !== card.overtimeAmountMinor
      || JSON.stringify(persistedSignature) !== JSON.stringify(currentSignature)) throw new OvertimeError("TIMECARD_STALE");
    const reviewers = await reviewerState(transaction, context.organizationId, employee);
    if (!reviewers.manager && reviewers.administrators.length === 0) throw new OvertimeError("TIMECARD_MISSING_REVIEWER");
    const [open] = await transaction.select().from(attendanceIntervals).where(and(eq(attendanceIntervals.employeeId, employee.id), eq(attendanceIntervals.status, "open"))).limit(1);
    if (open) throw new OvertimeError("TIMECARD_OPEN_INTERVAL");
    const action = card.status === "returned" ? "resubmitted" : "submitted";
    const [updated] = await transaction.update(timecards).set({ status: "submitted", submittedAt: new Date(), zeroHoursConfirmed, version: sql`${timecards.version} + 1`, updatedAt: new Date() }).where(eq(timecards.id, card.id)).returning();
    await transaction.insert(timecardEvents).values({ organizationId: context.organizationId, timecardId: card.id, action, actorProfileId: context.profile.id, priorStatus: card.status, resultingStatus: "submitted" });
    await addReceipt(transaction, { context, operation, requestId, payloadHash, entityType: "timecard", entityId: updated.id, version: updated.version });
    await writeAuditEvent(transaction, { organizationId: context.organizationId, actorProfileId: context.profile.id, action: `timecard.${action}`, entityType: "timecard", entityId: card.id, metadata: { employeeId: employee.id, status: updated.status, version: updated.version, workedSeconds: updated.workedSeconds } });
    return { card: updated, duplicate: false };
  });
}

async function assertReviewer(transaction, context, card, fallbackReason) {
  const employee = await loadAuthorizedEmployee(transaction, context, card.employeeId);
  if (employee.profileId === context.profile.id) throw new OvertimeError("OVERTIME_FORBIDDEN");
  const reviewers = await reviewerState(transaction, context.organizationId, employee);
  const directManager = reviewers.manager?.profile?.id === context.profile.id;
  if (directManager) return { employee, fallback: false };
  if (context.membership.role !== "administrator") throw new OvertimeError("OVERTIME_FORBIDDEN");
  if (reviewers.manager && (!fallbackReason || fallbackReason.length > 500)) throw new OvertimeError("TIMECARD_NOTE_REQUIRED");
  return { employee, fallback: true };
}

async function transitionReview({ context, timecardId, expectedVersion, note, fallbackReason, requestId, decision }) {
  const operation = `timecard.${decision}`;
  const payloadHash = hashPayload({ timecardId, expectedVersion, note, fallbackReason });
  return getDb().transaction(async (transaction) => {
    const duplicate = await existingReceipt(transaction, { organizationId: context.organizationId, operation, requestId, payloadHash });
    if (duplicate) return duplicate;
    const card = await lockCard(transaction, context, timecardId);
    assertExpectedVersion(card, expectedVersion);
    if (card.status !== "submitted") throw new OvertimeError("TIMECARD_INVALID_STATE");
    const reviewer = await assertReviewer(transaction, context, card, fallbackReason);
    if (decision === "return" && (!note || note.length > 500)) throw new OvertimeError("TIMECARD_NOTE_REQUIRED");
    const [schedule] = await transaction.select().from(payrollSchedules).where(eq(payrollSchedules.id, card.payrollScheduleId));
    const currentPolicy = await effectivePolicy(transaction, context.organizationId, { periodStart: card.periodStart, periodEnd: card.periodEnd }).catch(() => null);
    const currentPay = await effectivePaySetting(transaction, card.employeeId, schedule.frequency, { periodStart: card.periodStart, periodEnd: card.periodEnd }).catch(() => null);
    const drifted = decision === "approve" && (!currentPolicy || !currentPay || currentPolicy.id !== card.overtimePolicyId || currentPay.id !== card.paySettingId || currentPolicy.version !== card.policyVersion
      || currentPolicy.dailyThresholdMinutes !== card.dailyThresholdMinutes || currentPolicy.enabled !== card.policyEnabled
      || currentPay.grossAmountMinor !== card.baseGrossAmountMinor || currentPay.currency !== card.currency
      || currentPay.overtimeEligible !== card.overtimeEligible || currentPay.standardPeriodMinutes !== card.standardPeriodMinutes
      || currentPay.overtimeMultiplierBasisPoints !== card.overtimeMultiplierBasisPoints);
    const resultingStatus = drifted || decision === "return" ? "returned" : "approved";
    const action = drifted ? "configuration_returned" : decision === "return" ? "returned" : "approved";
    const [updated] = await transaction.update(timecards).set({ status: resultingStatus, approvedAt: resultingStatus === "approved" ? new Date() : null, version: sql`${timecards.version} + 1`, updatedAt: new Date() }).where(eq(timecards.id, card.id)).returning();
    await transaction.insert(timecardEvents).values({
      organizationId: context.organizationId, timecardId: card.id, action, actorProfileId: context.profile.id, priorStatus: card.status, resultingStatus,
      note: drifted ? null : note || fallbackReason || null, reasonCode: drifted ? "CONFIGURATION_DRIFT" : reviewer.fallback ? "ADMINISTRATOR_FALLBACK" : null,
    });
    await addReceipt(transaction, { context, operation, requestId, payloadHash, entityType: "timecard", entityId: updated.id, version: updated.version });
    await writeAuditEvent(transaction, { organizationId: context.organizationId, actorProfileId: context.profile.id, action: `timecard.${action}`, entityType: "timecard", entityId: card.id, metadata: { employeeId: card.employeeId, status: resultingStatus, version: updated.version, reasonCode: drifted ? "CONFIGURATION_DRIFT" : reviewer.fallback ? "ADMINISTRATOR_FALLBACK" : null } });
    return { card: updated, duplicate: false, configurationDrift: drifted };
  });
}

export function approveTimecard(input) { return transitionReview({ ...input, decision: "approve" }); }
export function returnTimecard(input) { return transitionReview({ ...input, decision: "return" }); }

export async function saveOvertimePolicy({ context, dailyThresholdMinutes, enabled, effectiveFrom, expectedVersion, requestId }) {
  const operation = "overtime_policy.save";
  const payloadHash = hashPayload({ dailyThresholdMinutes, enabled, effectiveFrom, expectedVersion });
  return getDb().transaction(async (transaction) => {
    const duplicate = await existingReceipt(transaction, { organizationId: context.organizationId, operation, requestId, payloadHash });
    if (duplicate) return duplicate;
    await lockOrganization(transaction, context.organizationId);
    const [schedule] = await transaction.select().from(payrollSchedules).where(eq(payrollSchedules.organizationId, context.organizationId));
    if (!schedule || getPeriodContaining(schedule, effectiveFrom).periodStart !== effectiveFrom) throw new OvertimeError("TIMECARD_ACTIVE_PERIOD");
    const [latest] = await transaction.select().from(overtimePolicies).where(eq(overtimePolicies.organizationId, context.organizationId)).orderBy(desc(overtimePolicies.version)).limit(1);
    if ((latest?.version ?? 0) !== expectedVersion) throw new OvertimeError("TIMECARD_STALE");
    const [policy] = await transaction.insert(overtimePolicies).values({ organizationId: context.organizationId, version: expectedVersion + 1, effectiveFrom, dailyThresholdMinutes, enabled }).returning();
    await addReceipt(transaction, { context, operation, requestId, payloadHash, entityType: "overtime_policy", entityId: policy.id, version: policy.version });
    await writeAuditEvent(transaction, { organizationId: context.organizationId, actorProfileId: context.profile.id, action: "overtime_policy.saved", entityType: "overtime_policy", entityId: policy.id, metadata: { version: policy.version, enabled, dailyThresholdMinutes } });
    return { policy, duplicate: false };
  });
}

export async function correctAttendanceInterval({ context, intervalId, correctedClockIn, correctedClockOut, reason, expectedCorrectionId, requestId }) {
  const operation = "attendance_interval.correct";
  const payloadHash = hashPayload({ intervalId, correctedClockIn, correctedClockOut, reason, expectedCorrectionId });
  if (!reason || reason.length > 500) throw new OvertimeError("TIMECARD_NOTE_REQUIRED");
  return getDb().transaction(async (transaction) => {
    const duplicate = await existingReceipt(transaction, { organizationId: context.organizationId, operation, requestId, payloadHash });
    if (duplicate) return duplicate;
    await transaction.execute(sql`SELECT id FROM attendance_intervals WHERE id = ${intervalId} FOR UPDATE`);
    const [interval] = await transaction.select({ interval: attendanceIntervals, employee: employees }).from(attendanceIntervals)
      .innerJoin(employees, and(eq(employees.id, attendanceIntervals.employeeId), eq(employees.organizationId, context.organizationId)))
      .where(eq(attendanceIntervals.id, intervalId));
    if (!interval || interval.interval.status !== "completed") throw new OvertimeError("TIMECARD_INVALID_INTERVAL");
    const [latest] = await transaction.select().from(attendanceIntervalCorrections).where(eq(attendanceIntervalCorrections.attendanceIntervalId, intervalId)).orderBy(desc(attendanceIntervalCorrections.createdAt), desc(attendanceIntervalCorrections.id)).limit(1);
    if ((latest?.id ?? null) !== (expectedCorrectionId ?? null)) throw new OvertimeError("TIMECARD_STALE");
    const [frozen] = await transaction.select({ id: timecards.id }).from(timecardDaySources)
      .innerJoin(timecardDays, eq(timecardDays.id, timecardDaySources.timecardDayId))
      .innerJoin(timecards, eq(timecards.id, timecardDays.timecardId))
      .where(and(eq(timecardDaySources.attendanceIntervalId, intervalId), inArray(timecards.status, ["submitted", "approved"]))).limit(1);
    if (frozen) throw new OvertimeError("TIMECARD_CORRECTION_BLOCKED");
    const clockIn = new Date(correctedClockIn);
    const clockOut = new Date(correctedClockOut);
    if (!(clockOut > clockIn) || (clockOut - clockIn) > 86_400_000) throw new OvertimeError("TIMECARD_INVALID_INTERVAL");
    const otherIntervals = await transaction.select().from(attendanceIntervals)
      .where(and(eq(attendanceIntervals.employeeId, interval.employee.id), eq(attendanceIntervals.status, "completed"), sql`${attendanceIntervals.id} <> ${intervalId}`));
    const otherCorrections = otherIntervals.length === 0 ? [] : await transaction.select().from(attendanceIntervalCorrections)
      .where(inArray(attendanceIntervalCorrections.attendanceIntervalId, otherIntervals.map((row) => row.id)))
      .orderBy(desc(attendanceIntervalCorrections.createdAt), desc(attendanceIntervalCorrections.id));
    const latestOtherCorrections = new Map();
    for (const correctionRow of otherCorrections) if (!latestOtherCorrections.has(correctionRow.attendanceIntervalId)) latestOtherCorrections.set(correctionRow.attendanceIntervalId, correctionRow);
    if (otherIntervals.some((row) => {
      const correctionRow = latestOtherCorrections.get(row.id);
      const start = correctionRow?.correctedClockIn ?? row.clockIn;
      const end = correctionRow?.correctedClockOut ?? row.clockOut;
      return start < clockOut && end > clockIn;
    })) throw new OvertimeError("TIMECARD_INVALID_INTERVAL");
    const [correction] = await transaction.insert(attendanceIntervalCorrections).values({ organizationId: context.organizationId, attendanceIntervalId: intervalId, actorProfileId: context.profile.id, correctedClockIn: clockIn, correctedClockOut: clockOut, reason }).returning();
    const localDates = [interval.interval.clockIn, interval.interval.clockOut, clockIn, clockOut]
      .map((instant) => getOrganizationLocalDate(context.organization.timezone, instant))
      .sort();
    const firstDate = localDates[0];
    const lastDate = localDates.at(-1);
    const affected = await transaction.select().from(timecards).where(and(
      eq(timecards.organizationId, context.organizationId),
      eq(timecards.employeeId, interval.employee.id),
      inArray(timecards.status, ["draft", "returned"]),
      lte(timecards.periodStart, lastDate),
      gte(timecards.periodEnd, firstDate),
    ));
    for (const affectedCard of affected) {
      const [schedule] = await transaction.select().from(payrollSchedules).where(eq(payrollSchedules.id, affectedCard.payrollScheduleId));
      const snapshot = await buildSnapshot(transaction, context, interval.employee, schedule, { periodStart: affectedCard.periodStart, periodEnd: affectedCard.periodEnd });
      const [updatedCard] = await transaction.update(timecards).set({ ...snapshotValues(context, interval.employee, schedule, { periodStart: affectedCard.periodStart, periodEnd: affectedCard.periodEnd }, snapshot), version: sql`${timecards.version} + 1` }).where(eq(timecards.id, affectedCard.id)).returning();
      await replaceEvidence(transaction, updatedCard, snapshot);
      await transaction.insert(timecardEvents).values({ organizationId: context.organizationId, timecardId: affectedCard.id, action: "prepared", actorProfileId: context.profile.id, priorStatus: affectedCard.status, resultingStatus: affectedCard.status, reasonCode: "ATTENDANCE_CORRECTION" });
    }
    const correctionRows = await transaction.select({ id: attendanceIntervalCorrections.id }).from(attendanceIntervalCorrections).where(eq(attendanceIntervalCorrections.attendanceIntervalId, intervalId));
    await addReceipt(transaction, { context, operation, requestId, payloadHash, entityType: "attendance_correction", entityId: correction.id, version: correctionRows.length });
    await writeAuditEvent(transaction, { organizationId: context.organizationId, actorProfileId: context.profile.id, action: "attendance_interval.corrected", entityType: "attendance_interval", entityId: intervalId, metadata: { employeeId: interval.employee.id, correctionId: correction.id, affectedDraftCount: affected.length } });
    return { correction, affectedTimecardIds: affected.map((card) => card.id), duplicate: false };
  });
}

export async function getDefaultClosedPeriod(organizationId, timezone) {
  const database = getDb();
  const [schedule] = await database.select().from(payrollSchedules).where(eq(payrollSchedules.organizationId, organizationId));
  if (!schedule) return null;
  return { ...getNextPeriod(schedule, null, getOrganizationLocalDate(timezone)), payrollScheduleId: schedule.id };
}

export async function getEmployeeTimecards(context, { cursor } = {}) {
  if (!context.employeeId) throw new OvertimeError("OVERTIME_FORBIDDEN");
  const boundary = decodeCursor(cursor);
  const where = [eq(timecards.organizationId, context.organizationId), eq(timecards.employeeId, context.employeeId)];
  if (boundary) where.push(or(lt(timecards.periodEnd, boundary.periodEnd), and(eq(timecards.periodEnd, boundary.periodEnd), lt(timecards.id, boundary.id))));
  const rows = await getDb().select().from(timecards).where(and(...where)).orderBy(desc(timecards.periodEnd), desc(timecards.id)).limit(TIMECARD_PAGE_SIZE + 1);
  const page = rows.slice(0, TIMECARD_PAGE_SIZE);
  const last = page.at(-1);
  return { rows: page, nextCursor: rows.length > TIMECARD_PAGE_SIZE && last ? encodeCursor({ periodEnd: last.periodEnd, id: last.id }) : null };
}

async function authorizeCardRead(database, context, card) {
  await loadAuthorizedEmployee(database, context, card.employeeId);
}

export async function getTimecardDetail(context, timecardId) {
  const database = getDb();
  const [row] = await database.select({ card: timecards, employee: employees, policy: overtimePolicies, paySetting: paySettings })
    .from(timecards).innerJoin(employees, eq(employees.id, timecards.employeeId)).innerJoin(overtimePolicies, eq(overtimePolicies.id, timecards.overtimePolicyId)).innerJoin(paySettings, eq(paySettings.id, timecards.paySettingId))
    .where(and(eq(timecards.id, timecardId), eq(timecards.organizationId, context.organizationId)));
  if (!row) throw new OvertimeError("TIMECARD_NOT_FOUND");
  await authorizeCardRead(database, context, row.card);
  const [days, events] = await Promise.all([
    database.select().from(timecardDays).where(eq(timecardDays.timecardId, timecardId)).orderBy(asc(timecardDays.localDate)),
    database.select({ event: timecardEvents, actor: profiles }).from(timecardEvents).innerJoin(profiles, eq(profiles.id, timecardEvents.actorProfileId)).where(eq(timecardEvents.timecardId, timecardId)).orderBy(asc(timecardEvents.occurredAt), asc(timecardEvents.id)),
  ]);
  const sources = days.length === 0 ? [] : await database.select().from(timecardDaySources).where(inArray(timecardDaySources.timecardDayId, days.map((day) => day.id))).orderBy(asc(timecardDaySources.clockInSnapshot));
  return { ...row, employeeLabel: displayName(row.employee), days: days.map((day) => ({ ...day, sources: sources.filter((source) => source.timecardDayId === day.id) })), events };
}

export async function getTimecardReviewQueue(context, { status = "submitted", periodStart, periodEnd, cursor } = {}) {
  if (!["manager", "administrator"].includes(context.membership.role)) throw new OvertimeError("OVERTIME_FORBIDDEN");
  if (!periodStart || !periodEnd) throw new OvertimeError("TIMECARD_ACTIVE_PERIOD");
  const [schedule] = await getDb().select().from(payrollSchedules).where(eq(payrollSchedules.organizationId, context.organizationId));
  const expectedPeriod = schedule ? getPeriodContaining(schedule, periodStart) : null;
  if (!expectedPeriod || expectedPeriod.periodStart !== periodStart || expectedPeriod.periodEnd !== periodEnd || !isClosedPeriod(expectedPeriod, getOrganizationLocalDate(context.organization.timezone))) {
    throw new OvertimeError("TIMECARD_ACTIVE_PERIOD");
  }
  const boundary = decodeCursor(cursor);
  const filters = [eq(timecards.organizationId, context.organizationId), eq(timecards.status, status), eq(timecards.periodStart, periodStart), eq(timecards.periodEnd, periodEnd)];
  if (context.membership.role === "manager") filters.push(eq(employees.managerId, context.employeeId));
  if (boundary) filters.push(or(gt(employees.employeeNumber, boundary.employeeNumber), and(eq(employees.employeeNumber, boundary.employeeNumber), gt(timecards.id, boundary.id))));
  const rows = await getDb().select({ card: timecards, employee: employees }).from(timecards).innerJoin(employees, eq(employees.id, timecards.employeeId))
    .where(and(...filters)).orderBy(asc(employees.employeeNumber), asc(timecards.id)).limit(TIMECARD_PAGE_SIZE + 1);
  const page = rows.slice(0, TIMECARD_PAGE_SIZE);
  const last = page.at(-1);
  return { rows: page.map((row) => ({ ...row, employeeLabel: displayName(row.employee) })), nextCursor: rows.length > TIMECARD_PAGE_SIZE && last ? encodeCursor({ employeeNumber: last.employee.employeeNumber, id: last.card.id }) : null };
}

export async function listOvertimePolicies(context) {
  if (context.membership.role !== "administrator") throw new OvertimeError("OVERTIME_FORBIDDEN");
  return getDb().select().from(overtimePolicies).where(eq(overtimePolicies.organizationId, context.organizationId)).orderBy(desc(overtimePolicies.effectiveFrom));
}

export async function getApprovedTimecardsForPayroll(database, organizationId, period, employeeIds) {
  if (employeeIds.length === 0) return [];
  return database.select().from(timecards).where(and(eq(timecards.organizationId, organizationId), eq(timecards.periodStart, period.periodStart), eq(timecards.periodEnd, period.periodEnd), eq(timecards.status, "approved"), inArray(timecards.employeeId, employeeIds)));
}

export function overtimeFingerprintRows(cards) {
  return cards.map((card) => ({ id: card.id, version: card.version, employeeId: card.employeeId, policyId: card.overtimePolicyId, paySettingId: card.paySettingId, baseGrossAmountMinor: card.baseGrossAmountMinor, payableOvertimeMinutes: card.payableOvertimeMinutes, overtimeAmountMinor: card.overtimeAmountMinor }));
}

export async function insertPayoutEarningLine(transaction, payout, card) {
  const [line] = await transaction.insert(payoutEarningLines).values({ payoutId: payout.id, timecardId: card.id, earningType: "overtime", payableMinutes: card.payableOvertimeMinutes, baseGrossAmountMinor: card.baseGrossAmountMinor, standardPeriodMinutes: card.standardPeriodMinutes, multiplierBasisPoints: card.overtimeMultiplierBasisPoints, currency: card.currency, amountMinor: card.overtimeAmountMinor, displayOrder: 0 }).returning();
  return line;
}

export async function writePayrollTimecardAudit(transaction, organizationId, actorProfileId, runId, cards) {
  await transaction.insert(auditEvents).values({ organizationId, actorProfileId, action: "payroll.timecards_consumed", entityType: "payroll_run", entityId: runId, metadata: { approvedTimecardCount: cards.length } });
}
