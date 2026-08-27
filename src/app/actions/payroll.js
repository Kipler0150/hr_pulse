"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import {
  employees,
  memberships,
  organizations,
  paySettingDeductions,
  paySettings,
  payouts,
  payrollRuns,
  payrollSchedules,
  payslips,
  profiles,
} from "@/db/schema";
import {
  validateDate,
  validateDeductionLines,
  validatePayFrequency,
  validateUuid,
} from "@/db/validation";
import { writeAuditEvent } from "@/lib/audit";
import { getCurrencyExponent } from "@/payroll/currency";
import { requirePayrollAdministrator } from "@/payroll/access";
import { serializePayrollError } from "@/payroll/errors";
import { nextDate } from "@/payroll/periods";
import { submitPayrollRun } from "@/payroll/queue";
import { confirmPayroll, getPayrollRun, previewPayroll } from "@/payroll/service";

function actionError(error) {
  const payrollError = serializePayrollError(error);
  if (payrollError.code !== "PAYROLL_PROCESSING_FAILED") return { error: payrollError };
  return { error: { code: "REQUEST_FAILED", message: error instanceof Error ? error.message : "Request failed", guidance: "Review the form and try again.", retryable: false } };
}

function text(formData, key) {
  return String(formData.get(key) ?? "").trim();
}

function parseMajorAmount(value, currency, field) {
  const exponent = getCurrencyExponent(currency);
  const pattern = exponent === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{1,${exponent}})?$`);
  if (!pattern.test(value)) throw new Error(`${field} must be a positive ${currency} amount`);
  const [whole, fraction = ""] = value.split(".");
  const amount = Number(whole) * (10 ** exponent) + Number(fraction.padEnd(exponent, "0"));
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(`${field} must be a positive safe amount`);
  return amount;
}

export async function saveEmployeeAction(previousState, formData) {
  try {
    const context = await requirePayrollAdministrator();
    const database = getDb();
    const employeeId = text(formData, "employeeId") || null;
    const hireDate = validateDate(text(formData, "hireDate"), "hireDate");
    const employeeNumber = text(formData, "employeeNumber");
    const legalName = text(formData, "legalName");
    const email = text(formData, "email").toLocaleLowerCase("en");
    if (!employeeNumber || !legalName || !email) throw new Error("Employee number, legal name, and email are required");
    const profileEmail = text(formData, "profileEmail").toLocaleLowerCase("en");
    let profileId = null;
    if (profileEmail) {
      const [profile] = await database.select().from(profiles).where(eq(profiles.email, profileEmail));
      if (!profile) throw new Error("No provisioned profile matches that exact email");
      profileId = profile.id;
    }
    const values = {
      organizationId: context.organizationId,
      employeeNumber,
      legalName,
      preferredName: text(formData, "preferredName") || null,
      email,
      hireDate,
      department: text(formData, "department") || null,
      title: text(formData, "title") || null,
      profileId,
      updatedAt: new Date(),
    };
    const employee = await database.transaction(async (transaction) => {
      let saved;
      if (employeeId) {
        validateUuid(employeeId, "employeeId");
        [saved] = await transaction.update(employees).set(values).where(and(eq(employees.id, employeeId), eq(employees.organizationId, context.organizationId))).returning();
      } else {
        [saved] = await transaction.insert(employees).values(values).returning();
      }
      if (!saved) throw new Error("Employee not found");
      await writeAuditEvent(transaction, {
        organizationId: context.organizationId,
        actorProfileId: context.profile.id,
        action: employeeId ? "employee.updated" : "employee.created",
        entityType: "employee",
        entityId: saved.id,
        metadata: { profileLinked: Boolean(profileId) },
      });
      return saved;
    });
    revalidatePath("/payroll/employees");
    return { success: true, employeeId: employee.id };
  } catch (error) { return actionError(error); }
}

export async function deactivateEmployeeAction(formData) {
  const context = await requirePayrollAdministrator();
  const employeeId = validateUuid(text(formData, "employeeId"), "employeeId");
  const database = getDb();
  await database.transaction(async (transaction) => {
    const [employee] = await transaction.update(employees).set({ status: "inactive", updatedAt: new Date() })
      .where(and(eq(employees.id, employeeId), eq(employees.organizationId, context.organizationId), eq(employees.status, "active"))).returning();
    if (!employee) throw new Error("This employee is not active or could not be found");
    await writeAuditEvent(transaction, {
      organizationId: context.organizationId, actorProfileId: context.profile.id, action: "employee.deactivated", entityType: "employee", entityId: employee.id,
    });
  });
  revalidatePath("/payroll/employees");
  revalidatePath(`/payroll/employees/${employeeId}`);
  revalidatePath("/payroll");
}

export async function savePaySettingAction(previousState, formData) {
  try {
    const context = await requirePayrollAdministrator();
    const employeeId = validateUuid(text(formData, "employeeId"), "employeeId");
    const database = getDb();
    const [organization] = await database.select().from(organizations).where(eq(organizations.id, context.organizationId));
    const [schedule] = await database.select().from(payrollSchedules).where(eq(payrollSchedules.organizationId, context.organizationId));
    const effectiveFrom = validateDate(text(formData, "effectiveFrom"), "effectiveFrom");
    const effectiveToValue = text(formData, "effectiveTo");
    const effectiveTo = effectiveToValue ? validateDate(effectiveToValue, "effectiveTo") : null;
    if (effectiveTo && effectiveTo < effectiveFrom) throw new Error("Effective end must be on or after effective start");
    const grossAmountMinor = parseMajorAmount(text(formData, "grossAmount"), organization.defaultCurrency, "Gross pay");
    const names = formData.getAll("deductionName");
    const amounts = formData.getAll("deductionAmount");
    const deductionInputs = names.map((name, index) => ({ name: String(name).trim(), amount: String(amounts[index] ?? "").trim(), index }))
      .filter((line) => line.name || line.amount);
    const deductions = validateDeductionLines(deductionInputs.map((line) => ({
      name: line.name,
      amountMinor: parseMajorAmount(line.amount, organization.defaultCurrency, `Deduction ${line.index + 1}`),
    })));
    const deductionTotal = deductions.reduce((total, deduction) => total + deduction.amountMinor, 0);
    if (deductionTotal > grossAmountMinor) throw new Error("Deductions cannot exceed gross pay");

    const setting = await database.transaction(async (transaction) => {
      const [employee] = await transaction.select().from(employees).where(and(eq(employees.id, employeeId), eq(employees.organizationId, context.organizationId)));
      if (!employee) throw new Error("Employee not found");
      const [saved] = await transaction.insert(paySettings).values({
        employeeId,
        effectiveFrom,
        effectiveTo,
        payFrequency: schedule.frequency,
        grossAmountMinor,
        currency: organization.defaultCurrency,
      }).returning();
      if (deductions.length > 0) await transaction.insert(paySettingDeductions).values(deductions.map((deduction) => ({ ...deduction, paySettingId: saved.id })));
      await writeAuditEvent(transaction, {
        organizationId: context.organizationId,
        actorProfileId: context.profile.id,
        action: "pay_setting.created",
        entityType: "pay_setting",
        entityId: saved.id,
        metadata: { employeeId, version: saved.version, deductionCount: deductions.length },
      });
      return saved;
    });
    revalidatePath("/payroll/employees");
    return { success: true, paySettingId: setting.id };
  } catch (error) { return actionError(error); }
}

export async function assignMembershipAction(previousState, formData) {
  try {
    const context = await requirePayrollAdministrator();
    const email = text(formData, "email").toLocaleLowerCase("en");
    const role = text(formData, "role");
    const status = text(formData, "status") || "active";
    if (!email || !["administrator", "manager", "employee"].includes(role) || !["active", "inactive"].includes(status)) throw new Error("Email, role, and access state are required");
    const database = getDb();
    const [profile] = await database.select().from(profiles).where(eq(profiles.email, email));
    if (!profile) throw new Error("No provisioned profile matches that exact email");
    const [membership] = await database.insert(memberships).values({
      organizationId: context.organizationId, profileId: profile.id, role, status, deactivatedAt: status === "inactive" ? new Date() : null,
    }).onConflictDoUpdate({
      target: [memberships.organizationId, memberships.profileId],
      set: { role, status, deactivatedAt: status === "inactive" ? new Date() : null, updatedAt: new Date() },
    }).returning();
    await writeAuditEvent(database, {
      organizationId: context.organizationId, actorProfileId: context.profile.id, action: "membership.assigned", entityType: "membership", entityId: membership.id,
      metadata: { role, status },
    });
    revalidatePath("/payroll/setup");
    return { success: true };
  } catch (error) { return actionError(error); }
}

export async function updateScheduleAction(previousState, formData) {
  try {
    const context = await requirePayrollAdministrator();
    const frequency = validatePayFrequency(text(formData, "frequency"), "frequency");
    const database = getDb();
    await database.transaction(async (transaction) => {
      await transaction.execute(sql`SELECT id FROM organizations WHERE id = ${context.organizationId} FOR UPDATE`);
      const [blocking] = await transaction.select().from(payrollRuns).where(and(eq(payrollRuns.organizationId, context.organizationId), sql`${payrollRuns.status} IN ('queued', 'processing', 'failed')`));
      if (blocking) throw new Error("Complete or recover the current payroll before changing the schedule");
      const [latest] = await transaction.select().from(payrollRuns).where(and(eq(payrollRuns.organizationId, context.organizationId), eq(payrollRuns.status, "completed"))).orderBy(desc(payrollRuns.periodEnd)).limit(1);
      const effectiveStartDate = latest ? nextDate(latest.periodEnd) : validateDate(text(formData, "effectiveStartDate"), "effectiveStartDate");
      const day = Number(effectiveStartDate.slice(-2));
      if (frequency === "semimonthly" && ![1, 16].includes(day)) throw new Error("The next period does not align to a semimonthly boundary");
      if (frequency === "monthly" && day !== 1) throw new Error("The next period does not align to a monthly boundary");
      const anchorStartDate = ["weekly", "biweekly"].includes(frequency) ? effectiveStartDate : null;
      const [schedule] = await transaction.update(payrollSchedules).set({ frequency, effectiveStartDate, anchorStartDate, version: sql`${payrollSchedules.version} + 1`, updatedAt: new Date() })
        .where(eq(payrollSchedules.organizationId, context.organizationId)).returning();
      await writeAuditEvent(transaction, {
        organizationId: context.organizationId, actorProfileId: context.profile.id, action: "payroll_schedule.changed", entityType: "payroll_schedule", entityId: schedule.id,
        metadata: { frequency, version: schedule.version },
      });
    });
    revalidatePath("/payroll/setup");
    return { success: true };
  } catch (error) { return actionError(error); }
}

export async function previewPayrollAction() {
  try {
    const context = await requirePayrollAdministrator();
    const preview = await previewPayroll({ organizationId: context.organizationId, actorProfileId: context.profile.id });
    return {
      success: preview.issues.length === 0,
      preview: {
        period: preview.period,
        rows: preview.rows.map((row) => ({
          employeeId: row.employee.id,
          employeeNumber: row.employee.employeeNumber,
          legalName: row.employee.legalName,
          grossAmountMinor: row.grossAmountMinor,
          deductions: row.deductions,
          deductionsAmountMinor: row.deductionsAmountMinor,
          netAmountMinor: row.netAmountMinor,
        })),
        totals: preview.totals,
        issues: preview.issues,
        currency: preview.organization.defaultCurrency,
        currencyExponent: getCurrencyExponent(preview.organization.defaultCurrency),
        token: preview.token,
        expiresAt: preview.expiresAt?.toISOString() ?? null,
      },
    };
  } catch (error) { return actionError(error); }
}

export async function confirmPayrollAction(previousState, formData) {
  try {
    const context = await requirePayrollAdministrator();
    const token = text(formData, "previewToken");
    if (!token) throw new Error("Preview token is required");
    const result = await confirmPayroll({ organizationId: context.organizationId, actorProfileId: context.profile.id, token });
    let queueWarning = null;
    if (!result.duplicate && result.run.status === "queued") {
      try {
        await submitPayrollRun({ runId: result.run.id, organizationId: context.organizationId, generation: result.run.processingGeneration });
      } catch (error) { queueWarning = serializePayrollError(error); }
    }
    revalidatePath("/payroll");
    return { success: true, runId: result.run.id, duplicate: result.duplicate, queueWarning };
  } catch (error) { return actionError(error); }
}

export async function resubmitPayrollAction(formData) {
  const context = await requirePayrollAdministrator();
  const runId = validateUuid(text(formData, "runId"), "runId");
  const detail = await getPayrollRun(context.organizationId, runId);
  if (detail.run.status !== "queued") return;
  await submitPayrollRun({ runId, organizationId: context.organizationId, generation: detail.run.processingGeneration });
  revalidatePath(`/payroll/runs/${runId}`);
}

export async function recoverPayrollAction(formData) {
  const context = await requirePayrollAdministrator();
  const runId = validateUuid(text(formData, "runId"), "runId");
  const database = getDb();
  await database.transaction(async (transaction) => {
    await transaction.execute(sql`SELECT id FROM organizations WHERE id = ${context.organizationId} FOR UPDATE`);
    await transaction.execute(sql`SELECT id FROM payroll_runs WHERE id = ${runId} FOR UPDATE`);
    const [run] = await transaction.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.organizationId, context.organizationId)));
    const lastProgress = run?.lastProgressAt ?? run?.updatedAt;
    if (!run || run.status !== "processing" || !run.leaseExpiresAt || run.leaseExpiresAt > new Date() || Date.now() - lastProgress.getTime() < 30 * 60 * 1000) {
      throw new Error("This run is not eligible for recovery");
    }
    await transaction.update(payouts).set({ status: "failed", errorCode: "PAYROLL_PROCESSING_FAILED", errorGuidance: "Retry the recovered payroll run.", updatedAt: new Date() }).where(eq(payouts.payrollRunId, runId));
    await transaction.update(payslips).set({ status: "failed", errorCode: "PAYROLL_PROCESSING_FAILED", errorGuidance: "Retry the recovered payroll run.", updatedAt: new Date() })
      .where(sql`${payslips.payoutId} IN (SELECT id FROM payouts WHERE payroll_run_id = ${runId})`);
    await transaction.update(payrollRuns).set({ status: "failed", leaseOwner: null, leaseExpiresAt: null, errorCode: "PAYROLL_PROCESSING_FAILED", errorGuidance: "Retry the recovered payroll run.", updatedAt: new Date() }).where(eq(payrollRuns.id, runId));
    await writeAuditEvent(transaction, {
      organizationId: context.organizationId, actorProfileId: context.profile.id, action: "payroll.recovered", entityType: "payroll_run", entityId: runId,
      metadata: { processingGeneration: run.processingGeneration, errorCode: "PAYROLL_PROCESSING_FAILED" },
    });
  });
  revalidatePath(`/payroll/runs/${runId}`);
}

export async function retryPayrollAction(formData) {
  const context = await requirePayrollAdministrator();
  const runId = validateUuid(text(formData, "runId"), "runId");
  const database = getDb();
  const run = await database.transaction(async (transaction) => {
    await transaction.execute(sql`SELECT id FROM organizations WHERE id = ${context.organizationId} FOR UPDATE`);
    await transaction.execute(sql`SELECT id FROM payroll_runs WHERE id = ${runId} FOR UPDATE`);
    const [current] = await transaction.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.organizationId, context.organizationId)));
    if (!current || current.status !== "failed") throw new Error("This run is not ready to retry");
    const generation = current.processingGeneration + 1;
    await transaction.update(payouts).set({ status: "pending", errorCode: null, errorGuidance: null, updatedAt: new Date() }).where(eq(payouts.payrollRunId, runId));
    await transaction.update(payslips).set({ status: "pending", immutable: false, errorCode: null, errorGuidance: null, updatedAt: new Date() })
      .where(sql`${payslips.payoutId} IN (SELECT id FROM payouts WHERE payroll_run_id = ${runId})`);
    const [updated] = await transaction.update(payrollRuns).set({
      status: "queued", processingGeneration: generation, queueStatus: "pending", queueSubmittedAt: null, queueEventId: null, queueErrorCode: null,
      errorCode: null, errorGuidance: null, leaseOwner: null, leaseExpiresAt: null, lastProgressAt: null, updatedAt: new Date(),
    }).where(eq(payrollRuns.id, runId)).returning();
    await writeAuditEvent(transaction, {
      organizationId: context.organizationId, actorProfileId: context.profile.id, action: "payroll.retry_requested", entityType: "payroll_run", entityId: runId,
      metadata: { processingGeneration: generation },
    });
    return updated;
  });
  await submitPayrollRun({ runId, organizationId: context.organizationId, generation: run.processingGeneration }).catch(() => {});
  revalidatePath(`/payroll/runs/${runId}`);
}

export async function goToRunAction(previousState, formData) {
  const result = await confirmPayrollAction(previousState, formData);
  if (result.success) redirect(`/payroll/runs/${result.runId}`);
  return result;
}
