import { and, desc, eq, gte, isNotNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, operationFailures, payrollRuns, productEvents } from "@/db/schema";
import { validateDate, validateUuid } from "@/db/validation";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, AUDIT_RESULTS, PRODUCT_EVENTS, WORKFLOW_AREAS } from "./catalog";
import { requireProductOperationsContext } from "./access";
import { assertProductOperationsEnabled } from "./config";
import { ProductOperationsError } from "./errors";
import { signAuditCursor, verifyAuditCursor } from "./cursor";

const DAY_MS = 24 * 60 * 60 * 1000;
const AUDIT_PAGE_SIZE = 50;
const WINDOW_DAYS = { today: 1, "7d": 7, "30d": 30 };
const PRODUCT_LABELS = {
  "auth.sign_in_succeeded": "Signed in",
  "setup.organization_completed": "Organization setup",
  "setup.employee_created": "Employees added",
  "attendance.checked_in": "Checked in",
  "attendance.clocked_out": "Clocked out",
  "time_off.submitted": "Time off submitted",
  "time_off.approved": "Time off approved",
  "time_off.declined": "Time off declined",
  "timecard.submitted": "Timecards submitted",
  "timecard.approved": "Timecards approved",
  "payroll.preview_created": "Payroll previews",
  "payroll.confirmed": "Payroll confirmed",
  "payroll.completed": "Payroll completed",
  "payroll.failed": "Payroll failed",
  "self_service.profile_updated": "Profiles updated",
  "self_service.payslip_downloaded": "Payslips downloaded",
};

function valueOf(params, key) {
  const value = params?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function trend(current, previous) {
  const change = current - previous;
  return {
    current,
    previous,
    change,
    direction: change === 0 ? "flat" : change > 0 ? "up" : "down",
    percent: previous === 0 ? null : Math.round((change / previous) * 100),
  };
}

function localDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function localDateNow(timeZone) {
  const parts = localDateParts(new Date(), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function zonedMidnight(dateValue, timeZone) {
  const rough = new Date(`${dateValue}T00:00:00.000Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(rough);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour) % 24, Number(values.minute), Number(values.second));
  return new Date(rough.getTime() - (asUtc - rough.getTime()));
}

function dateRange(params, timeZone) {
  const today = localDateNow(timeZone);
  const fromValue = valueOf(params, "from");
  const toValue = valueOf(params, "to");
  const from = fromValue ? validateDate(fromValue, "from") : addDays(today, -29);
  const to = toValue ? validateDate(toValue, "to") : today;
  if (to < from || (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / DAY_MS > 89) throw new ProductOperationsError("AUDIT_FILTER_INVALID");
  return { from, to, start: zonedMidnight(from, timeZone), end: zonedMidnight(addDays(to, 1), timeZone) };
}

function validatedAuditFilters(params, timeZone) {
  const range = dateRange(params, timeZone);
  const filters = {
    from: range.from,
    to: range.to,
    actorProfileId: valueOf(params, "actorProfileId") || null,
    action: valueOf(params, "action") || null,
    entityType: valueOf(params, "entityType") || null,
    result: valueOf(params, "result") || null,
  };
  if (filters.actorProfileId) validateUuid(filters.actorProfileId, "actorProfileId");
  if (filters.action && !AUDIT_ACTIONS.has(filters.action)) throw new ProductOperationsError("AUDIT_FILTER_INVALID");
  if (filters.entityType && !AUDIT_ENTITY_TYPES.has(filters.entityType)) throw new ProductOperationsError("AUDIT_FILTER_INVALID");
  if (filters.result && !AUDIT_RESULTS.has(filters.result)) throw new ProductOperationsError("AUDIT_FILTER_INVALID");
  return { ...filters, ...range };
}

function safeAuditRow(row) {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    result: row.result ?? "success",
    actorLabel: row.actorLabelSnapshot,
    actorRole: row.actorRoleSnapshot,
    correlationId: row.correlationId,
    createdAt: row.createdAt,
    resultingVersion: row.metadata?.resultingVersion ?? null,
    changedFields: Array.isArray(row.metadata?.changedFields) ? row.metadata.changedFields : [],
    reasonCodes: Array.isArray(row.metadata?.reasonCodes) ? row.metadata.reasonCodes : [],
  };
}

export async function getAuditHistory(params = {}) {
  assertProductOperationsEnabled();
  const context = await requireProductOperationsContext();
  const filters = validatedAuditFilters(params, context.organization.timezone);
  const cursorValue = valueOf(params, "cursor");
  const cursor = cursorValue ? verifyAuditCursor(cursorValue, { organizationId: context.organizationId, filters: { from: filters.from, to: filters.to, actorProfileId: filters.actorProfileId, action: filters.action, entityType: filters.entityType, result: filters.result } }) : null;
  const conditions = [
    eq(auditEvents.organizationId, context.organizationId),
    gte(auditEvents.createdAt, filters.start),
    lt(auditEvents.createdAt, filters.end),
  ];
  if (filters.actorProfileId) conditions.push(eq(auditEvents.actorProfileId, filters.actorProfileId));
  if (filters.action) conditions.push(eq(auditEvents.action, filters.action));
  if (filters.entityType) conditions.push(eq(auditEvents.entityType, filters.entityType));
  if (filters.result) conditions.push(eq(auditEvents.result, filters.result));
  if (cursor) conditions.push(or(lt(auditEvents.createdAt, cursor.createdAt), and(eq(auditEvents.createdAt, cursor.createdAt), lt(auditEvents.id, cursor.id))));
  const rows = await getDb().select().from(auditEvents).where(and(...conditions)).orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(AUDIT_PAGE_SIZE + 1);
  const visibleRows = rows.slice(0, AUDIT_PAGE_SIZE);
  const last = visibleRows.at(-1);
  const canonicalFilters = { from: filters.from, to: filters.to, actorProfileId: filters.actorProfileId, action: filters.action, entityType: filters.entityType, result: filters.result };
  return {
    rows: visibleRows.map(safeAuditRow),
    filters: canonicalFilters,
    timezone: context.organization.timezone,
    nextCursor: rows.length > AUDIT_PAGE_SIZE && last ? signAuditCursor({ organizationId: context.organizationId, filters: canonicalFilters, createdAt: last.createdAt, id: last.id }) : null,
  };
}

export async function getAuditEventDetail(eventId) {
  assertProductOperationsEnabled();
  const context = await requireProductOperationsContext();
  try { validateUuid(eventId, "eventId"); } catch { throw new ProductOperationsError("AUDIT_EVENT_NOT_FOUND"); }
  const [row] = await getDb().select().from(auditEvents).where(and(eq(auditEvents.id, eventId), eq(auditEvents.organizationId, context.organizationId)));
  if (!row) throw new ProductOperationsError("AUDIT_EVENT_NOT_FOUND");
  return safeAuditRow(row);
}

async function productCounts(database, organizationId, start, end) {
  return database.select({ eventName: productEvents.eventName, count: sql`count(*)::int` }).from(productEvents)
    .where(and(eq(productEvents.organizationId, organizationId), gte(productEvents.occurredAt, start), lt(productEvents.occurredAt, end))).groupBy(productEvents.eventName);
}

async function workflowCounts(database, organizationId, start, end) {
  return database.select({ workflowArea: productEvents.workflowArea, resultCategory: productEvents.resultCategory, count: sql`count(*)::int` }).from(productEvents)
    .where(and(eq(productEvents.organizationId, organizationId), gte(productEvents.occurredAt, start), lt(productEvents.occurredAt, end))).groupBy(productEvents.workflowArea, productEvents.resultCategory);
}

async function latencyCounts(database, organizationId, start, end) {
  return database.select({
    eventName: productEvents.eventName,
    sampleCount: sql`count(*)::int`,
    averageMs: sql`round(avg(${productEvents.durationMs}))::int`,
    p50Ms: sql`round(percentile_cont(0.5) within group (order by ${productEvents.durationMs}))::int`,
    p95Ms: sql`round(percentile_cont(0.95) within group (order by ${productEvents.durationMs}))::int`,
  }).from(productEvents).where(and(eq(productEvents.organizationId, organizationId), gte(productEvents.occurredAt, start), lt(productEvents.occurredAt, end), isNotNull(productEvents.durationMs))).groupBy(productEvents.eventName);
}

async function queueHealth(database, organizationId) {
  const rows = await database.select({ status: payrollRuns.status, queueStatus: payrollRuns.queueStatus, lastProgressAt: payrollRuns.lastProgressAt, leaseExpiresAt: payrollRuns.leaseExpiresAt }).from(payrollRuns).where(eq(payrollRuns.organizationId, organizationId));
  const now = Date.now();
  return {
    state: "available",
    queued: rows.filter((row) => row.status === "queued").length,
    processing: rows.filter((row) => row.status === "processing").length,
    completed: rows.filter((row) => row.status === "completed").length,
    failed: rows.filter((row) => row.status === "failed" || row.queueStatus === "failed").length,
    delayed: rows.filter((row) => ["queued", "processing"].includes(row.status) && row.lastProgressAt && now - row.lastProgressAt.getTime() >= 30 * 60 * 1000).length,
    retryable: rows.filter((row) => row.status === "failed" || row.queueStatus === "failed").length,
  };
}

function recoveryHref(entityType, entityId) {
  if (!entityId) return null;
  const routes = {
    payroll_run: `/payroll/runs/${entityId}`,
    timecard: `/timecards/${entityId}`,
    leave_request: `/time-off/${entityId}`,
    employee: `/payroll/employees/${entityId}`,
  };
  return routes[entityType] ?? null;
}

async function failureRows(database, organizationId, start) {
  const rows = await database.select().from(operationFailures).where(and(eq(operationFailures.organizationId, organizationId), gte(operationFailures.lastSeenAt, start)))
    .orderBy(desc(operationFailures.lastSeenAt), desc(operationFailures.id)).limit(25);
  return rows.map((row) => ({
    id: row.id,
    operation: row.operation,
    safeCode: row.safeCode,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    occurrenceCount: row.occurrenceCount,
    affectedEntityType: row.affectedEntityType,
    workflowStatus: row.workflowStatus,
    recoveryAvailable: row.recoveryAvailable,
    detailHref: recoveryHref(row.affectedEntityType, row.affectedEntityId),
    correlationId: row.correlationId,
  }));
}

export async function getOperationsSummary(windowOrOptions = "30d") {
  assertProductOperationsEnabled();
  const context = await requireProductOperationsContext();
  const window = typeof windowOrOptions === "string" ? windowOrOptions : valueOf(windowOrOptions, "window") ?? "30d";
  if (!Object.hasOwn(WINDOW_DAYS, window)) throw new ProductOperationsError("AUDIT_FILTER_INVALID");
  const database = getDb();
  const now = new Date();
  const today = localDateNow(context.organization.timezone);
  const start = zonedMidnight(addDays(today, -(WINDOW_DAYS[window] - 1)), context.organization.timezone);
  const end = new Date(now.getTime() + 1);
  const previousStart = new Date(start.getTime() - (WINDOW_DAYS[window] * DAY_MS));
  const groups = await Promise.allSettled([
    Promise.all([productCounts(database, context.organizationId, start, end), productCounts(database, context.organizationId, previousStart, start)]),
    Promise.all([workflowCounts(database, context.organizationId, start, end), workflowCounts(database, context.organizationId, previousStart, start)]),
    latencyCounts(database, context.organizationId, start, end),
    queueHealth(database, context.organizationId),
    failureRows(database, context.organizationId, start),
  ]);
  const [adoptionGroup, workflowGroup, latencyGroup, queueGroup, failureGroup] = groups;
  const adoption = adoptionGroup.status === "fulfilled" ? (() => {
    const [current, prior] = adoptionGroup.value;
    const currentMap = new Map(current.map((row) => [row.eventName, Number(row.count)]));
    const priorMap = new Map(prior.map((row) => [row.eventName, Number(row.count)]));
    const total = current.reduce((sum, row) => sum + Number(row.count), 0);
    const priorTotal = prior.reduce((sum, row) => sum + Number(row.count), 0);
    return {
      state: "available",
      total,
      trend: trend(total, priorTotal),
      milestones: PRODUCT_EVENTS.size ? [...PRODUCT_EVENTS].map((eventName) => {
        const count = currentMap.get(eventName) ?? 0;
        const priorCount = priorMap.get(eventName) ?? 0;
        return { eventName, label: PRODUCT_LABELS[eventName], count, priorCount, trend: trend(count, priorCount) };
      }) : [],
    };
  })() : { state: "unavailable", total: null, trend: null, milestones: [] };
  const workflowHealth = workflowGroup.status === "fulfilled" ? (() => {
    const [current, prior] = workflowGroup.value;
    return {
      state: "available",
      areas: [...WORKFLOW_AREAS].map((workflowArea) => {
        const rows = current.filter((row) => row.workflowArea === workflowArea);
        const priorRows = prior.filter((row) => row.workflowArea === workflowArea);
        const success = Number(rows.find((row) => row.resultCategory === "success")?.count ?? 0);
        const expectedError = Number(rows.find((row) => row.resultCategory === "expected_error")?.count ?? 0);
        const unexpectedError = Number(rows.find((row) => row.resultCategory === "unexpected_error")?.count ?? 0);
        return {
          workflowArea,
          success,
          expectedError,
          unexpectedError,
          trends: {
            success: trend(success, Number(priorRows.find((row) => row.resultCategory === "success")?.count ?? 0)),
            expectedError: trend(expectedError, Number(priorRows.find((row) => row.resultCategory === "expected_error")?.count ?? 0)),
            unexpectedError: trend(unexpectedError, Number(priorRows.find((row) => row.resultCategory === "unexpected_error")?.count ?? 0)),
          },
        };
      }),
    };
  })() : { state: "unavailable", areas: [] };
  const latency = latencyGroup.status === "fulfilled" ? { state: "available", rows: latencyGroup.value.map((row) => ({ eventName: row.eventName, label: PRODUCT_LABELS[row.eventName] ?? row.eventName, sampleCount: Number(row.sampleCount), averageMs: Number(row.averageMs), p50Ms: Number(row.p50Ms), p95Ms: Number(row.p95Ms) })) } : { state: "unavailable", rows: [] };
  const failures = failureGroup.status === "fulfilled" ? { state: "available", rows: failureGroup.value } : { state: "unavailable", rows: [] };
  const queue = queueGroup.status === "fulfilled" ? queueGroup.value : { state: "unavailable", queued: null, processing: null, completed: null, failed: null, delayed: null, retryable: null };
  const unexpectedCurrent = workflowGroup.status === "fulfilled" ? workflowGroup.value[0].filter((row) => row.resultCategory === "unexpected_error").reduce((sum, row) => sum + Number(row.count), 0) : null;
  const unexpectedPrior = workflowGroup.status === "fulfilled" ? workflowGroup.value[1].filter((row) => row.resultCategory === "unexpected_error").reduce((sum, row) => sum + Number(row.count), 0) : null;
  return {
    window,
    timezone: context.organization.timezone,
    adoption,
    workflowHealth,
    latency,
    queue,
    failures,
    unexpectedErrors: { state: workflowHealth.state, count: unexpectedCurrent, trend: unexpectedCurrent === null ? null : trend(unexpectedCurrent, unexpectedPrior) },
    partial: groups.some((group) => group.status === "rejected"),
  };
}

export { AUDIT_PAGE_SIZE };
