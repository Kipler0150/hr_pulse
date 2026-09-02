import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  employees,
  memberships,
  organizations,
  paySettingDeductions,
  paySettings,
  payoutDeductionLines,
  payoutEarningLines,
  payouts,
  payrollPreviewTokens,
  payrollRunAttempts,
  payrollRuns,
  payrollSchedules,
  payslips,
} from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { calculatePayout, calculateRunTotals, PAYROLL_CALCULATION_VERSION } from "./calculator";
import { assertPayrollEnabled, assertPayslipConfiguration } from "./config";
import { CURRENCY_MAP_VERSION, getCurrencyExponent, isSupportedCurrency } from "./currency";
import { PayrollError, payrollIssue, serializePayrollError } from "./errors";
import { createPreviewToken, createSourceFingerprint, hashPreviewToken } from "./fingerprint";
import { getNextPeriod, getOrganizationLocalDate, isClosedPeriod } from "./periods";
import { decodeCursor, decodeTimestampCursor, encodeCursor, encodeTimestampCursor, PAYROLL_PAGE_SIZE } from "./pagination";
import { isOvertimeEnabled } from "@/overtime/config";
import { getApprovedTimecardsForPayroll, insertPayoutEarningLine, overtimeFingerprintRows, writePayrollTimecardAudit } from "@/overtime/service";
import { recordPayrollMetric } from "./telemetry";

const PREVIEW_LIFETIME_MS = 30 * 60 * 1000;
const DELAYED_AFTER_MS = 30 * 60 * 1000;

function normalizeDate(value) {
  if (!value) return null;
  return typeof value === "string" ? value : value.toISOString().slice(0, 10);
}

async function getOrganizationPayrollSource(database, organizationId) {
  const [row] = await database.select({ organization: organizations, schedule: payrollSchedules })
    .from(organizations)
    .innerJoin(payrollSchedules, eq(payrollSchedules.organizationId, organizations.id))
    .where(eq(organizations.id, organizationId));
  if (!row || row.organization.status !== "active") throw new PayrollError("ORGANIZATION_INACTIVE");
  return row;
}

async function getPeriodState(database, organizationId, schedule, organization) {
  const [blockingRun] = await database.select({ id: payrollRuns.id, status: payrollRuns.status })
    .from(payrollRuns)
    .where(and(eq(payrollRuns.organizationId, organizationId), inArray(payrollRuns.status, ["queued", "processing", "failed"])))
    .limit(1);
  const [latestCompleted] = await database.select({ periodEnd: payrollRuns.periodEnd })
    .from(payrollRuns)
    .where(and(eq(payrollRuns.organizationId, organizationId), eq(payrollRuns.status, "completed")))
    .orderBy(desc(payrollRuns.periodEnd))
    .limit(1);
  const organizationToday = getOrganizationLocalDate(organization.timezone);
  const period = getNextPeriod({
    frequency: schedule.frequency,
    anchorStartDate: normalizeDate(schedule.anchorStartDate),
    effectiveStartDate: normalizeDate(schedule.effectiveStartDate),
  }, latestCompleted?.periodEnd ? normalizeDate(latestCompleted.periodEnd) : null, organizationToday);
  return { blockingRun, organizationToday, period };
}

async function loadPreview(database, organizationId) {
  const { organization, schedule } = await getOrganizationPayrollSource(database, organizationId);
  if (!isSupportedCurrency(organization.defaultCurrency)) {
    return { organization, schedule, period: null, rows: [], issues: [payrollIssue("CURRENCY_MISMATCH")], fingerprint: null };
  }

  let periodState;
  try {
    periodState = await getPeriodState(database, organizationId, schedule, organization);
  } catch (error) {
    if (error.message === "no closed payroll period is available") {
      return { organization, schedule, period: null, rows: [], issues: [payrollIssue("NO_CLOSED_PERIOD")], fingerprint: null };
    }
    throw error;
  }
  const { blockingRun, organizationToday, period } = periodState;
  const issues = [];
  if (blockingRun) issues.push(payrollIssue("PAYROLL_PERIOD_BLOCKED"));
  if (!isClosedPeriod(period, organizationToday)) issues.push(payrollIssue("PAYROLL_PERIOD_BLOCKED"));

  const employeeRows = await database.select().from(employees)
    .where(and(
      eq(employees.organizationId, organizationId),
      eq(employees.status, "active"),
      lte(employees.hireDate, period.periodStart),
    ))
    .orderBy(asc(employees.employeeNumber), asc(employees.id));
  if (employeeRows.length > 500) issues.push(payrollIssue("EMPLOYEE_LIMIT_EXCEEDED"));
  if (employeeRows.length === 0) issues.push(payrollIssue("NO_ELIGIBLE_EMPLOYEES"));

  const employeeIds = employeeRows.map((employee) => employee.id);
  const overtimeEnabled = isOvertimeEnabled();
  const approvedTimecards = overtimeEnabled ? await getApprovedTimecardsForPayroll(database, organizationId, period, employeeIds) : [];
  const timecardByEmployee = new Map(approvedTimecards.map((card) => [card.employeeId, card]));
  if (overtimeEnabled) {
    for (const employee of employeeRows) if (!timecardByEmployee.has(employee.id)) issues.push(payrollIssue("TIMECARD_APPROVAL_MISSING", { employeeId: employee.id, field: "timecard" }));
  }
  const approvedSettingIds = approvedTimecards.map((card) => card.paySettingId);
  const settingRows = employeeIds.length === 0 ? [] : await database.select().from(paySettings)
    .where(overtimeEnabled
      ? approvedSettingIds.length > 0 ? inArray(paySettings.id, approvedSettingIds) : sql`false`
      : and(inArray(paySettings.employeeId, employeeIds), lte(paySettings.effectiveFrom, period.periodStart), or(isNull(paySettings.effectiveTo), sql`${paySettings.effectiveTo} >= ${period.periodEnd}`)));
  const settingIds = settingRows.map((setting) => setting.id);
  const deductionRows = settingIds.length === 0 ? [] : await database.select().from(paySettingDeductions)
    .where(inArray(paySettingDeductions.paySettingId, settingIds))
    .orderBy(asc(paySettingDeductions.displayOrder), asc(paySettingDeductions.id));
  const settingByEmployee = new Map(settingRows.map((setting) => [setting.employeeId, setting]));
  const deductionsBySetting = Map.groupBy(deductionRows, (deduction) => deduction.paySettingId);
  const rows = [];

  for (const employee of employeeRows) {
    const timecard = timecardByEmployee.get(employee.id) ?? null;
    if (overtimeEnabled && !timecard) continue;
    const setting = overtimeEnabled ? settingRows.find((row) => row.id === timecard?.paySettingId) : settingByEmployee.get(employee.id);
    if (!setting) {
      issues.push(payrollIssue("PAY_SETTING_MISSING", { employeeId: employee.id, field: "paySetting" }));
      continue;
    }
    if (setting.payFrequency !== schedule.frequency) {
      issues.push(payrollIssue("PAY_SETTING_MISSING", { employeeId: employee.id, field: "payFrequency" }));
      continue;
    }
    if (setting.currency !== organization.defaultCurrency) {
      issues.push(payrollIssue("CURRENCY_MISMATCH", { employeeId: employee.id, field: "currency" }));
      continue;
    }
    try {
      const calculation = calculatePayout({
        grossAmountMinor: overtimeEnabled ? timecard.baseGrossAmountMinor + timecard.overtimeAmountMinor : setting.grossAmountMinor,
        deductions: deductionsBySetting.get(setting.id) ?? [],
      });
      rows.push({ employee, paySetting: setting, timecard, baseGrossAmountMinor: overtimeEnabled ? timecard.baseGrossAmountMinor : setting.grossAmountMinor, overtimeAmountMinor: timecard?.overtimeAmountMinor ?? 0, payableOvertimeMinutes: timecard?.payableOvertimeMinutes ?? 0, overtimeMultiplierBasisPoints: timecard?.overtimeMultiplierBasisPoints ?? null, ...calculation });
    } catch (error) {
      const code = error.message.includes("exceed") ? "DEDUCTIONS_EXCEED_GROSS" : "PAY_SETTING_MISSING";
      issues.push(payrollIssue(code, { employeeId: employee.id, field: "deductions" }));
    }
  }

  const source = {
    organization: {
      id: organization.id,
      name: organization.name,
      timezone: organization.timezone,
      currency: organization.defaultCurrency,
      status: organization.status,
      updatedAt: organization.updatedAt,
    },
    schedule: {
      id: schedule.id,
      frequency: schedule.frequency,
      anchorStartDate: schedule.anchorStartDate,
      effectiveStartDate: schedule.effectiveStartDate,
      version: schedule.version,
      updatedAt: schedule.updatedAt,
    },
    period,
    employees: rows.map((row) => ({
      id: row.employee.id,
      employeeNumber: row.employee.employeeNumber,
      legalName: row.employee.legalName,
      hireDate: row.employee.hireDate,
      status: row.employee.status,
      updatedAt: row.employee.updatedAt,
      paySetting: {
        id: row.paySetting.id,
        version: row.paySetting.version,
        effectiveFrom: row.paySetting.effectiveFrom,
        effectiveTo: row.paySetting.effectiveTo,
        payFrequency: row.paySetting.payFrequency,
        grossAmountMinor: row.baseGrossAmountMinor,
        currency: row.paySetting.currency,
        overtimeEligible: row.timecard?.overtimeEligible ?? row.paySetting.overtimeEligible,
        standardPeriodMinutes: row.timecard?.standardPeriodMinutes ?? row.paySetting.standardPeriodMinutes,
        overtimeMultiplierBasisPoints: row.timecard?.overtimeMultiplierBasisPoints ?? row.paySetting.overtimeMultiplierBasisPoints,
        updatedAt: row.paySetting.updatedAt,
      },
      deductions: row.deductions.map((deduction) => ({
        id: deduction.id,
        name: deduction.name,
        amountMinor: deduction.amountMinor,
        displayOrder: deduction.displayOrder,
      })),
    })),
    approvedTimecards: overtimeEnabled ? overtimeFingerprintRows(approvedTimecards) : [],
    calculationVersion: PAYROLL_CALCULATION_VERSION,
  };

  return { organization, schedule, period, rows, issues, fingerprint: createSourceFingerprint(source) };
}

export async function previewPayroll({ organizationId, actorProfileId, persistToken = true, database = getDb(), recordBlockedTelemetry = true }) {
  const startedAt = Date.now();
  try {
    assertPayrollEnabled();
    assertPayslipConfiguration();
    const preview = await loadPreview(database, organizationId);
    const totals = calculateRunTotals(preview.rows);
    if (preview.issues.length > 0 && recordBlockedTelemetry) {
      const issueCodes = [...new Set(preview.issues.map((issue) => issue.code))];
      const durationMs = Math.max(0, Date.now() - startedAt);
      await writeAuditEvent(database, {
        organizationId,
        actorProfileId,
        action: "payroll.preview.blocked",
        entityType: "payroll_preview",
        entityId: organizationId,
        metadata: {
          reasonCodes: issueCodes,
          issueCount: preview.issues.length,
          durationMs,
        },
      });
      for (const code of issueCodes) {
        recordPayrollMetric({ operation: "payroll.preview.blocked", organizationId, entityId: organizationId, code, durationMs });
      }
    }
    if (preview.issues.length > 0 || !persistToken) return { ...preview, totals, token: null, expiresAt: null };

    const { token, tokenHash } = createPreviewToken();
    const expiresAt = new Date(Date.now() + PREVIEW_LIFETIME_MS);
    await database.insert(payrollPreviewTokens).values({
      organizationId,
      actorProfileId,
      periodStart: preview.period.periodStart,
      periodEnd: preview.period.periodEnd,
      fingerprint: preview.fingerprint,
      calculationVersion: PAYROLL_CALCULATION_VERSION,
      payrollPeriodEnd: preview.period.periodEnd,
      tokenHash,
      expiresAt,
    });
    return { ...preview, totals, token, expiresAt };
  } catch (error) {
    if (recordBlockedTelemetry) {
      const safe = serializePayrollError(error);
      recordPayrollMetric({ operation: "payroll.preview.blocked", organizationId, entityId: organizationId, code: safe.code, durationMs: Date.now() - startedAt });
    }
    throw error;
  }
}

export async function confirmPayroll({ organizationId, actorProfileId, token }) {
  const startedAt = Date.now();
  try {
    assertPayrollEnabled();
    assertPayslipConfiguration();
    const database = getDb();
    const tokenHash = hashPreviewToken(token);
    const result = await database.transaction(async (transaction) => {
    const [existingByToken] = await transaction.select().from(payrollRuns)
      .where(and(eq(payrollRuns.organizationId, organizationId), eq(payrollRuns.previewTokenHash, tokenHash)));
    if (existingByToken) return { run: existingByToken, duplicate: true };

    const [previewToken] = await transaction.select().from(payrollPreviewTokens)
      .where(and(eq(payrollPreviewTokens.organizationId, organizationId), eq(payrollPreviewTokens.tokenHash, tokenHash)));
    if (!previewToken) {
      throw new PayrollError("PREVIEW_EXPIRED");
    }
    await transaction.execute(sql`SELECT id FROM organizations WHERE id = ${organizationId} FOR UPDATE`);
    const [existingByPeriod] = await transaction.select().from(payrollRuns).where(and(
      eq(payrollRuns.organizationId, organizationId),
      eq(payrollRuns.periodStart, previewToken.periodStart),
      eq(payrollRuns.periodEnd, previewToken.periodEnd),
    ));
    if (existingByPeriod) return { run: existingByPeriod, duplicate: true };
    if (previewToken.actorProfileId !== actorProfileId || previewToken.consumedAt || previewToken.expiresAt <= new Date()) {
      throw new PayrollError("PREVIEW_EXPIRED");
    }
    const preview = await loadPreview(transaction, organizationId);
    if (preview.issues.length > 0 || preview.fingerprint !== previewToken.fingerprint || previewToken.calculationVersion !== PAYROLL_CALCULATION_VERSION) {
      throw new PayrollError("PREVIEW_STALE");
    }
    if (preview.period.periodStart !== normalizeDate(previewToken.periodStart) || preview.period.periodEnd !== normalizeDate(previewToken.periodEnd)) {
      throw new PayrollError("PREVIEW_STALE");
    }

    const runId = randomUUID();
    const totals = calculateRunTotals(preview.rows);
    const payrollReference = `PAY${preview.period.periodEnd.replaceAll("-", "")}${runId.replaceAll("-", "")}`;
    const [run] = await transaction.insert(payrollRuns).values({
      id: runId,
      organizationId,
      payrollScheduleId: preview.schedule.id,
      periodStart: preview.period.periodStart,
      periodEnd: preview.period.periodEnd,
      organizationName: preview.organization.name,
      organizationTimezone: preview.organization.timezone,
      payFrequency: preview.schedule.frequency,
      scheduleVersion: preview.schedule.version,
      grossTotalMinor: totals.grossTotalMinor,
      deductionsTotalMinor: totals.deductionsTotalMinor,
      netTotalMinor: totals.netTotalMinor,
      currency: preview.organization.defaultCurrency,
      currencyExponent: getCurrencyExponent(preview.organization.defaultCurrency),
      currencyMapVersion: CURRENCY_MAP_VERSION,
      calculationVersion: PAYROLL_CALCULATION_VERSION,
      payrollReference,
      confirmedByProfileId: actorProfileId,
      sourceFingerprint: preview.fingerprint,
      previewTokenHash: tokenHash,
    }).returning();

    for (const row of preview.rows) {
      const [payout] = await transaction.insert(payouts).values({
        payrollRunId: run.id,
        employeeId: row.employee.id,
        paySettingId: row.paySetting.id,
        employeeNumber: row.employee.employeeNumber,
        legalName: row.employee.legalName,
        grossAmountMinor: row.grossAmountMinor,
        deductionsAmountMinor: row.deductionsAmountMinor,
        netAmountMinor: row.netAmountMinor,
        currency: preview.organization.defaultCurrency,
        currencyExponent: getCurrencyExponent(preview.organization.defaultCurrency),
        calculationVersion: PAYROLL_CALCULATION_VERSION,
        payrollPeriodEnd: run.periodEnd,
      }).returning();
      if (row.deductions.length > 0) {
        await transaction.insert(payoutDeductionLines).values(row.deductions.map((deduction) => ({
          payoutId: payout.id,
          sourceDeductionId: deduction.id,
          name: deduction.name,
          amountMinor: deduction.amountMinor,
          displayOrder: deduction.displayOrder,
        })));
      }
      if (row.timecard) await insertPayoutEarningLine(transaction, payout, row.timecard);
      await transaction.insert(payslips).values({ payoutId: payout.id });
    }
    await transaction.update(payrollPreviewTokens).set({ consumedAt: new Date() }).where(eq(payrollPreviewTokens.id, previewToken.id));
    await writeAuditEvent(transaction, {
      organizationId,
      actorProfileId,
      action: "payroll.confirmed",
      entityType: "payroll_run",
      entityId: run.id,
      metadata: { calculationVersion: PAYROLL_CALCULATION_VERSION, status: "queued" },
    });
    if (isOvertimeEnabled()) await writePayrollTimecardAudit(transaction, organizationId, actorProfileId, run.id, preview.rows.map((row) => row.timecard));
    return { run, duplicate: false };
    });
    recordPayrollMetric({
      operation: "payroll.confirm",
      organizationId,
      entityId: result.run?.id ?? organizationId,
      code: "ok",
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    const safe = serializePayrollError(error);
    recordPayrollMetric({
      operation: "payroll.confirm",
      organizationId,
      entityId: organizationId,
      code: safe.code,
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

export async function getSetupChecklist(organizationId, actorProfileId) {
  const database = getDb();
  const [schedule] = await database.select().from(payrollSchedules).where(eq(payrollSchedules.organizationId, organizationId));
  const [adminCount] = await database.select({ count: sql`count(*)::int` }).from(memberships).where(and(
    eq(memberships.organizationId, organizationId), eq(memberships.role, "administrator"), eq(memberships.status, "active"),
  ));
  const [completedCount] = await database.select({ count: sql`count(*)::int` }).from(payrollRuns).where(and(
    eq(payrollRuns.organizationId, organizationId), eq(payrollRuns.status, "completed"),
  ));
  let readiness = { rows: [], issues: [payrollIssue("NO_ELIGIBLE_EMPLOYEES")] };
  try { readiness = await previewPayroll({ organizationId, actorProfileId, persistToken: false, database, recordBlockedTelemetry: false }); } catch {}
  return {
    schedule: Boolean(schedule),
    administratorAccess: Number(adminCount?.count ?? 0) > 0,
    employeePay: readiness.rows.length > 0,
    previewReady: readiness.rows.length > 0 && readiness.issues.length === 0,
    firstPayroll: Number(completedCount?.count ?? 0) > 0,
  };
}

export async function listPayrollRuns(organizationId, cursorValue) {
  const cursor = decodeTimestampCursor(cursorValue);
  const createdAtMilliseconds = sql`floor(extract(epoch from ${payrollRuns.createdAt}) * 1000)`;
  const cursorFilter = cursor
    ? or(lt(createdAtMilliseconds, cursor.createdAtMilliseconds), and(eq(createdAtMilliseconds, cursor.createdAtMilliseconds), lt(payrollRuns.id, cursor.id)))
    : undefined;
  const rows = await getDb().select().from(payrollRuns).where(and(eq(payrollRuns.organizationId, organizationId), cursorFilter))
    .orderBy(desc(createdAtMilliseconds), desc(payrollRuns.id)).limit(PAYROLL_PAGE_SIZE + 1);
  const visibleRows = rows.slice(0, PAYROLL_PAGE_SIZE);
  const boundary = visibleRows.at(-1);
  return {
    rows: visibleRows,
    nextCursor: rows.length > PAYROLL_PAGE_SIZE && boundary
      ? encodeTimestampCursor(boundary.createdAt, boundary.id)
      : null,
  };
}

export async function getPayrollRun(organizationId, runId, cursorValue) {
  const database = getDb();
  const [run] = await database.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.organizationId, organizationId)));
  if (!run) throw new Error("Payroll run not found");
  const cursor = decodeCursor(cursorValue, ["employeeNumber", "id"]);
  const payoutCursorFilter = cursor
    ? or(gt(payouts.employeeNumber, cursor.employeeNumber), and(eq(payouts.employeeNumber, cursor.employeeNumber), gt(payouts.id, cursor.id)))
    : undefined;
  const [allPayoutRows, attemptRows] = await Promise.all([
    database.select({ payout: payouts, payslip: payslips }).from(payouts)
      .leftJoin(payslips, eq(payslips.payoutId, payouts.id))
      .where(and(eq(payouts.payrollRunId, runId), payoutCursorFilter)).orderBy(asc(payouts.employeeNumber), asc(payouts.id)).limit(PAYROLL_PAGE_SIZE + 1),
    database.select().from(payrollRunAttempts).where(eq(payrollRunAttempts.payrollRunId, runId)).orderBy(desc(payrollRunAttempts.startedAt)),
  ]);
  const lastProgress = run.lastProgressAt ?? run.updatedAt;
  const delayed = ["queued", "processing"].includes(run.status) && Date.now() - lastProgress.getTime() >= DELAYED_AFTER_MS;
  const recoveryEligible = delayed && run.leaseExpiresAt && run.leaseExpiresAt <= new Date();
  const payoutRows = allPayoutRows.slice(0, PAYROLL_PAGE_SIZE);
  const payoutIds = payoutRows.map((row) => row.payout.id);
  const earningRows = payoutIds.length === 0 ? [] : await database.select().from(payoutEarningLines).where(inArray(payoutEarningLines.payoutId, payoutIds)).orderBy(asc(payoutEarningLines.displayOrder));
  const boundary = payoutRows.at(-1)?.payout;
  return {
    run,
    payouts: payoutRows.map((row) => ({ ...row, earnings: earningRows.filter((earning) => earning.payoutId === row.payout.id) })),
    payoutNextCursor: allPayoutRows.length > PAYROLL_PAGE_SIZE && boundary
      ? encodeCursor({ employeeNumber: boundary.employeeNumber, id: boundary.id })
      : null,
    attempts: attemptRows,
    delayed,
    recoveryEligible,
  };
}

export async function getPayrollRunStatus(organizationId, runId) {
  const database = getDb();
  const [[run], [attemptState]] = await Promise.all([
    database.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.organizationId, organizationId))),
    database.select({ count: sql`count(*)::int` }).from(payrollRunAttempts).where(eq(payrollRunAttempts.payrollRunId, runId)),
  ]);
  if (!run) throw new Error("Payroll run not found");
  const lastProgress = run.lastProgressAt ?? run.updatedAt;
  const delayed = ["queued", "processing"].includes(run.status) && Date.now() - lastProgress.getTime() >= DELAYED_AFTER_MS;
  const recoveryEligible = delayed && run.leaseExpiresAt && run.leaseExpiresAt <= new Date();
  return { run, attemptCount: Number(attemptState?.count ?? 0), delayed, recoveryEligible };
}
