import { and, desc, eq, inArray, lt, or } from "drizzle-orm";

import { getDb } from "@/db";
import { validateUuid } from "@/db/validation";
import { employees, payoutDeductionLines, payoutEarningLines, payouts, payrollRuns, payslips, timecardDays, timecardDaySources, timecards } from "@/db/schema";
import { encodeSelfServiceCursor, decodeSelfServiceCursor } from "./cursor";
import { SelfServiceError } from "./errors";
import { assertSelfServiceTestFailure } from "./config";
import { recordSelfServiceMetric, reportSelfServiceFailure } from "./telemetry";

const PAGE_SIZE = 12;

function validateSelfServiceDetailId(id) {
  try {
    return validateUuid(id, "id");
  } catch {
    throw new SelfServiceError("SELF_SERVICE_NOT_FOUND");
  }
}

function periodFilter(column, cursor) {
  return cursor ? or(lt(column, cursor.periodEnd), and(eq(column, cursor.periodEnd), lt(payouts.id, cursor.id))) : undefined;
}

export async function getSelfServiceProfile(context) {
  const manager = context.employee.managerId
    ? await getDb().select({ legalName: employees.legalName, preferredName: employees.preferredName }).from(employees).where(and(eq(employees.id, context.employee.managerId), eq(employees.organizationId, context.organizationId))).then(([row]) => row ?? null)
    : null;
  return { employee: context.employee, managerName: manager ? manager.preferredName || manager.legalName : "No manager assigned" };
}

export async function getSelfServiceHome(context) {
  const database = getDb();
  const read = async (query, operation, failurePoint) => {
    const startedAt = Date.now();
    try {
      assertSelfServiceTestFailure(failurePoint);
      const value = (await query())[0] ?? null;
      recordSelfServiceMetric({ operation, organizationId: context.organizationId, employeeId: context.employee.id, result: "success", retryOutcome: "not_applicable", durationMs: Date.now() - startedAt });
      return { value, error: false };
    }
    catch (error) {
      reportSelfServiceFailure(error, { operation, organizationId: context.organizationId, employeeId: context.employee.id, durationMs: Date.now() - startedAt });
      return { value: null, error: true };
    }
  };
  const [timecard, payslip] = await Promise.all([
    read(() => database.select({ periodStart: timecards.periodStart, periodEnd: timecards.periodEnd }).from(timecards).where(and(eq(timecards.organizationId, context.organizationId), eq(timecards.employeeId, context.employee.id), eq(timecards.status, "approved"))).orderBy(desc(timecards.periodEnd), desc(timecards.id)).limit(1), "self_service.home", "home.timecard"),
    read(() => database.select({ periodStart: payrollRuns.periodStart, periodEnd: payrollRuns.periodEnd }).from(payslips).innerJoin(payouts, eq(payslips.payoutId, payouts.id)).innerJoin(payrollRuns, eq(payouts.payrollRunId, payrollRuns.id)).where(and(eq(payouts.employeeId, context.employee.id), eq(payouts.status, "finalized"), eq(payslips.status, "generated"), eq(payslips.immutable, true), eq(payrollRuns.organizationId, context.organizationId), eq(payrollRuns.status, "completed"))).orderBy(desc(payrollRuns.periodEnd), desc(payslips.id)).limit(1), "self_service.home", "home.payslip"),
  ]);
  return { profileComplete: Boolean(context.employee.preferredName && context.employee.phone), latestTimecard: timecard.value, latestPayslip: payslip.value, timecardError: timecard.error, payslipError: payslip.error };
}

export async function listApprovedTimecards(context, cursorValue) {
  const cursor = decodeSelfServiceCursor(cursorValue, { organizationId: context.organizationId, employeeId: context.employee.id, kind: "time", status: "approved" });
  const cursorFilter = cursor ? or(lt(timecards.periodEnd, cursor.periodEnd), and(eq(timecards.periodEnd, cursor.periodEnd), lt(timecards.id, cursor.id))) : undefined;
  const rows = await getDb().select({ id: timecards.id, periodStart: timecards.periodStart, periodEnd: timecards.periodEnd, timezone: timecards.timezone, workedSeconds: timecards.workedSeconds, regularSeconds: timecards.regularSeconds, overtimeSeconds: timecards.overtimeSeconds, payableOvertimeMinutes: timecards.payableOvertimeMinutes, overtimeAmountMinor: timecards.overtimeAmountMinor, currency: timecards.currency }).from(timecards).where(and(eq(timecards.organizationId, context.organizationId), eq(timecards.employeeId, context.employee.id), eq(timecards.status, "approved"), cursorFilter)).orderBy(desc(timecards.periodEnd), desc(timecards.id)).limit(PAGE_SIZE + 1);
  const visible = rows.slice(0, PAGE_SIZE);
  const boundary = visible.at(-1);
  return { rows: visible, nextCursor: rows.length > PAGE_SIZE && boundary ? encodeSelfServiceCursor({ organizationId: context.organizationId, employeeId: context.employee.id, kind: "time", status: "approved", periodEnd: boundary.periodEnd, id: boundary.id }) : null };
}

export async function getApprovedTimecard(context, id) {
  validateSelfServiceDetailId(id);
  const database = getDb();
  const [card] = await database.select({ id: timecards.id, periodStart: timecards.periodStart, periodEnd: timecards.periodEnd, status: timecards.status, timezone: timecards.timezone, policyVersion: timecards.policyVersion, dailyThresholdMinutes: timecards.dailyThresholdMinutes, policyEnabled: timecards.policyEnabled, overtimeEligible: timecards.overtimeEligible, standardPeriodMinutes: timecards.standardPeriodMinutes, overtimeMultiplierBasisPoints: timecards.overtimeMultiplierBasisPoints, currency: timecards.currency, workedSeconds: timecards.workedSeconds, regularSeconds: timecards.regularSeconds, overtimeSeconds: timecards.overtimeSeconds, payableOvertimeMinutes: timecards.payableOvertimeMinutes, overtimeAmountMinor: timecards.overtimeAmountMinor }).from(timecards).where(and(eq(timecards.id, id), eq(timecards.organizationId, context.organizationId), eq(timecards.employeeId, context.employee.id), eq(timecards.status, "approved")));
  if (!card) throw new SelfServiceError("SELF_SERVICE_NOT_FOUND");
  const days = await database.select({ id: timecardDays.id, localDate: timecardDays.localDate, workedSeconds: timecardDays.workedSeconds, regularSeconds: timecardDays.regularSeconds, overtimeSeconds: timecardDays.overtimeSeconds, payableOvertimeMinutes: timecardDays.payableOvertimeMinutes, overtimeAmountMinor: timecardDays.overtimeAmountMinor, currency: timecardDays.currency }).from(timecardDays).where(eq(timecardDays.timecardId, card.id)).orderBy(timecardDays.localDate);
  const sources = days.length ? await database.select({ timecardDayId: timecardDaySources.timecardDayId, clockInSnapshot: timecardDaySources.clockInSnapshot, clockOutSnapshot: timecardDaySources.clockOutSnapshot, allocatedSeconds: timecardDaySources.allocatedSeconds }).from(timecardDaySources).where(inArray(timecardDaySources.timecardDayId, days.map((day) => day.id))) : [];
  return { card, days, sources };
}

export async function listPayslips(context, cursorValue) {
  const cursor = decodeSelfServiceCursor(cursorValue, { organizationId: context.organizationId, employeeId: context.employee.id, kind: "payslip", status: "generated" });
  const filter = periodFilter(payouts.payrollPeriodEnd, cursor);
  const rows = await getDb().select({ id: payslips.id, payoutId: payouts.id, periodStart: payrollRuns.periodStart, periodEnd: payouts.payrollPeriodEnd, generatedAt: payslips.generatedAt }).from(payslips).innerJoin(payouts, eq(payslips.payoutId, payouts.id)).innerJoin(payrollRuns, eq(payouts.payrollRunId, payrollRuns.id)).where(and(eq(payouts.employeeId, context.employee.id), eq(payrollRuns.organizationId, context.organizationId), eq(payrollRuns.status, "completed"), eq(payouts.status, "finalized"), eq(payslips.status, "generated"), eq(payslips.immutable, true), filter)).orderBy(desc(payouts.payrollPeriodEnd), desc(payouts.id)).limit(PAGE_SIZE + 1);
  const visible = rows.slice(0, PAGE_SIZE); const boundary = visible.at(-1);
  return { rows: visible, nextCursor: rows.length > PAGE_SIZE && boundary ? encodeSelfServiceCursor({ organizationId: context.organizationId, employeeId: context.employee.id, kind: "payslip", status: "generated", periodEnd: boundary.periodEnd, id: boundary.payoutId }) : null };
}

export async function getPayslip(context, id) {
  validateSelfServiceDetailId(id);
  const database = getDb();
  const [record] = await database.select({ id: payslips.id, storagePath: payslips.storagePath, organizationName: payrollRuns.organizationName, organizationTimezone: payrollRuns.organizationTimezone, periodStart: payrollRuns.periodStart, periodEnd: payrollRuns.periodEnd, payrollReference: payrollRuns.payrollReference, employeeNumber: payouts.employeeNumber, legalName: payouts.legalName, grossAmountMinor: payouts.grossAmountMinor, deductionsAmountMinor: payouts.deductionsAmountMinor, netAmountMinor: payouts.netAmountMinor, currency: payouts.currency, currencyExponent: payouts.currencyExponent }).from(payslips).innerJoin(payouts, eq(payslips.payoutId, payouts.id)).innerJoin(payrollRuns, eq(payouts.payrollRunId, payrollRuns.id)).where(and(eq(payslips.id, id), eq(payouts.employeeId, context.employee.id), eq(payrollRuns.organizationId, context.organizationId), eq(payrollRuns.status, "completed"), eq(payouts.status, "finalized"), eq(payslips.status, "generated"), eq(payslips.immutable, true)));
  if (!record) throw new SelfServiceError("SELF_SERVICE_NOT_FOUND");
  const [deductions, earnings] = await Promise.all([database.select({ name: payoutDeductionLines.name, amountMinor: payoutDeductionLines.amountMinor, displayOrder: payoutDeductionLines.displayOrder }).from(payoutDeductionLines).innerJoin(payslips, eq(payslips.payoutId, payoutDeductionLines.payoutId)).where(eq(payslips.id, id)).orderBy(payoutDeductionLines.displayOrder), database.select({ earningType: payoutEarningLines.earningType, amountMinor: payoutEarningLines.amountMinor, payableMinutes: payoutEarningLines.payableMinutes }).from(payoutEarningLines).innerJoin(payslips, eq(payslips.payoutId, payoutEarningLines.payoutId)).where(eq(payslips.id, id)).orderBy(payoutEarningLines.displayOrder)]);
  return { record, deductions, earnings };
}
