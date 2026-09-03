import { createHash } from "node:crypto";

import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  privacyConsents,
  privacyDeletionExecutions,
  privacyHolds,
  privacyRequests,
} from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";

import { analyticsSubjectKey } from "./analytics";
import { isPrivacyEnabled, PRIVACY_POLICY_VERSION, PRIVACY_RETENTION } from "./config";

const DEFAULT_BATCH_SIZE = 100;
const SAFE_FAILURE_CODE = "OPERATION_UNAVAILABLE";
const SUBJECT_REQUEST_STATUSES = ["approved", "scheduled", "failed"];

function boundedBatchSize(value) {
  return Math.min(Math.max(Number(value) || DEFAULT_BATCH_SIZE, 1), DEFAULT_BATCH_SIZE);
}

function monthsAgo(value, months) {
  const date = new Date(value);
  const targetMonth = date.getUTCMonth() - months;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  date.setUTCFullYear(targetYear, normalizedMonth, Math.min(date.getUTCDate(), lastDay));
  return date;
}

function retentionTimestamp(value) {
  return new Date(value).toISOString();
}

function countByOrganization(rows) {
  const counts = new Map();
  for (const row of rows) counts.set(row.organization_id, (counts.get(row.organization_id) ?? 0) + 1);
  return counts;
}

function executionKey(prefix, ids, now) {
  const digest = createHash("sha256").update(ids.join("|")).digest("hex").slice(0, 16);
  return `${prefix}:${now.getTime()}:${digest}`.slice(0, 100);
}

async function getHeldSubjectKeys(tx) {
  const holds = await tx.select({
    organizationId: privacyHolds.organizationId,
    profileId: privacyHolds.profileId,
  }).from(privacyHolds).where(eq(privacyHolds.active, true));
  return [...new Set(holds.map((hold) => analyticsSubjectKey({
    organizationId: hold.organizationId,
    profileId: hold.profileId,
  })) )];
}

function excludeHeldSubjectKeys(subjectKeys) {
  if (subjectKeys.length === 0) return sql`true`;
  return sql`(
    analytics_subject_key is null
    or analytics_subject_key not in (${sql.join(subjectKeys.map((key) => sql`${key}`), sql`, `)})
  )`;
}

async function enableRetentionDeletes(tx) {
  await tx.execute(sql`select set_config('app.privacy_retention_delete', 'on', true)`);
}

async function recordGlobalExecutions(tx, { policyClass, rows, now, batchSize }) {
  const counts = countByOrganization(rows);
  const ids = rows.map((row) => row.id);
  for (const [organizationId, count] of counts) {
    await tx.insert(privacyDeletionExecutions).values({
      organizationId,
      executionKey: executionKey(`retention:${policyClass}:${organizationId}`, ids, now),
      policyVersion: PRIVACY_POLICY_VERSION,
      status: "completed",
      batchSize,
      deletedCounts: { [policyClass]: count },
      startedAt: now,
      finishedAt: now,
    }).onConflictDoNothing({ target: privacyDeletionExecutions.executionKey });
  }
}

async function deleteGlobalAnalytics(tx, { cutoff, batchSize, now, heldSubjectKeys }) {
  const rows = await tx.execute(sql`
    with eligible as (
      select id
      from product_events
      where occurred_at < ${retentionTimestamp(cutoff)}::timestamptz
        and ${excludeHeldSubjectKeys(heldSubjectKeys)}
      order by occurred_at asc, id asc
      limit ${batchSize}
    )
    delete from product_events target
    using eligible
    where target.id = eligible.id
    returning target.id, target.organization_id
  `);
  if (rows.length) await recordGlobalExecutions(tx, { policyClass: "product_analytics", rows, now, batchSize });
  return rows.length;
}

async function deleteGlobalFailures(tx, { cutoff, batchSize, now, heldSubjectKeys }) {
  const rows = await tx.execute(sql`
    with eligible as (
      select id
      from operation_failures
      where last_seen_at < ${retentionTimestamp(cutoff)}::timestamptz
        and ${excludeHeldSubjectKeys(heldSubjectKeys)}
      order by last_seen_at asc, id asc
      limit ${batchSize}
    )
    delete from operation_failures target
    using eligible
    where target.id = eligible.id
    returning target.id, target.organization_id
  `);
  if (rows.length) await recordGlobalExecutions(tx, { policyClass: "failure_summaries", rows, now, batchSize });
  return rows.length;
}

async function deleteGlobalSupersededConsents(tx, { cutoff, batchSize, now }) {
  const rows = await tx.execute(sql`
    with eligible as (
      select id
      from privacy_consents
      where superseded_at < ${retentionTimestamp(cutoff)}::timestamptz
        and not exists (
          select 1
          from privacy_holds
          where privacy_holds.organization_id = privacy_consents.organization_id
            and privacy_holds.profile_id = privacy_consents.profile_id
            and privacy_holds.active = true
        )
      order by superseded_at asc, id asc
      limit ${batchSize}
    )
    delete from privacy_consents target
    using eligible
    where target.id = eligible.id
    returning target.id, target.organization_id
  `);
  if (rows.length) await recordGlobalExecutions(tx, { policyClass: "superseded_consent_history", rows, now, batchSize });
  return rows.length;
}

async function deleteCompletedRequestArtifacts(tx, { cutoff, batchSize, now }) {
  const requests = await tx.select({ id: privacyRequests.id, organizationId: privacyRequests.organizationId })
    .from(privacyRequests)
    .where(and(eq(privacyRequests.status, "completed"), lt(privacyRequests.completedAt, cutoff)))
    .orderBy(privacyRequests.completedAt, privacyRequests.id)
    .limit(batchSize);
  if (!requests.length) return 0;
  const ids = requests.map((row) => row.id);
  await tx.delete(privacyDeletionExecutions).where(inArray(privacyDeletionExecutions.privacyRequestId, ids));
  await tx.delete(privacyRequests).where(inArray(privacyRequests.id, ids));
  await recordGlobalExecutions(tx, {
    policyClass: "completed_privacy_requests",
    rows: requests.map((row) => ({ id: row.id, organization_id: row.organizationId })),
    now,
    batchSize,
  });
  return requests.length;
}

async function deleteUnlinkedExecutionArtifacts(tx, { cutoff, batchSize }) {
  const rows = await tx.execute(sql`
    with eligible as (
      select id
      from privacy_deletion_executions
      where privacy_request_id is null
        and started_at < ${retentionTimestamp(cutoff)}::timestamptz
      order by started_at asc, id asc
      limit ${batchSize}
    )
    delete from privacy_deletion_executions target
    using eligible
    where target.id = eligible.id
    returning target.id
  `);
  return rows.length;
}

async function subjectRowsRemain(tx, { organizationId, subjectKey, profileId }) {
  const [events] = await tx.execute(sql`
    select exists(
      select 1 from product_events
      where organization_id = ${organizationId} and analytics_subject_key = ${subjectKey}
    ) as present
  `);
  const [failures] = await tx.execute(sql`
    select exists(
      select 1 from operation_failures
      where organization_id = ${organizationId} and analytics_subject_key = ${subjectKey}
    ) as present
  `);
  const [consents] = await tx.execute(sql`
    select exists(
      select 1 from privacy_consents
      where organization_id = ${organizationId} and profile_id = ${profileId} and superseded_at is not null
    ) as present
  `);
  return Boolean(events?.present || failures?.present || consents?.present);
}

async function processSubjectRequest({ db, request, now, batchSize }) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(privacyRequests).where(and(
      eq(privacyRequests.id, request.id),
      eq(privacyRequests.organizationId, request.organizationId),
      inArray(privacyRequests.status, SUBJECT_REQUEST_STATUSES),
    )).limit(1);
    if (!current) return { status: "skipped" };

    if (current.status === "approved" || current.status === "failed") {
      const [scheduled] = await tx.update(privacyRequests).set({
        status: "scheduled",
        scheduledAt: current.scheduledAt ?? now,
        failedAt: null,
        failureCode: null,
        updatedAt: now,
      }).where(and(
        eq(privacyRequests.id, current.id),
        inArray(privacyRequests.status, ["approved", "failed"]),
      )).returning();
      if (!scheduled) return { status: "skipped" };
    }

    const [hold] = await tx.select({ id: privacyHolds.id }).from(privacyHolds).where(and(
      eq(privacyHolds.organizationId, current.organizationId),
      eq(privacyHolds.profileId, current.profileId),
      eq(privacyHolds.active, true),
    )).limit(1);
    const subjectKey = analyticsSubjectKey({ organizationId: current.organizationId, profileId: current.profileId });
    const executionIds = [current.id, subjectKey, now.toISOString()];
    const key = executionKey("request", executionIds, now);

    if (hold) {
      await tx.insert(privacyDeletionExecutions).values({
        organizationId: current.organizationId,
        privacyRequestId: current.id,
        executionKey: key,
        policyVersion: current.policyVersion,
        status: "completed",
        batchSize,
        deletedCounts: { skippedByHold: true },
        startedAt: now,
        finishedAt: now,
      }).onConflictDoNothing({ target: privacyDeletionExecutions.executionKey });
      return { status: "held", requestId: current.id };
    }

    await tx.insert(privacyDeletionExecutions).values({
      organizationId: current.organizationId,
      privacyRequestId: current.id,
      executionKey: key,
      policyVersion: current.policyVersion,
      status: "processing",
      batchSize,
      startedAt: now,
    }).onConflictDoNothing({ target: privacyDeletionExecutions.executionKey });
    await enableRetentionDeletes(tx);

    const eventRows = await tx.execute(sql`
      with eligible as (
        select id from product_events
        where organization_id = ${current.organizationId} and analytics_subject_key = ${subjectKey}
        order by occurred_at asc, id asc limit ${batchSize}
      )
      delete from product_events target using eligible
      where target.id = eligible.id
      returning target.id
    `);
    const failureRows = await tx.execute(sql`
      with eligible as (
        select id from operation_failures
        where organization_id = ${current.organizationId} and analytics_subject_key = ${subjectKey}
        order by last_seen_at asc, id asc limit ${batchSize}
      )
      delete from operation_failures target using eligible
      where target.id = eligible.id
      returning target.id
    `);
    const consentRows = await tx.execute(sql`
      with eligible as (
        select id from privacy_consents
        where organization_id = ${current.organizationId}
          and profile_id = ${current.profileId}
          and superseded_at is not null
        order by superseded_at asc, id asc limit ${batchSize}
      )
      delete from privacy_consents target using eligible
      where target.id = eligible.id
      returning target.id
    `);
    const deletedCounts = {
      product_analytics: eventRows.length,
      failure_summaries: failureRows.length,
      superseded_consent_history: consentRows.length,
    };
    const remains = await subjectRowsRemain(tx, {
      organizationId: current.organizationId,
      subjectKey,
      profileId: current.profileId,
    });
    const [updatedRequest] = await tx.update(privacyRequests).set({
      status: remains ? "scheduled" : "completed",
      completedAt: remains ? null : now,
      failedAt: null,
      failureCode: null,
      deletedCounts,
      updatedAt: now,
    }).where(eq(privacyRequests.id, current.id)).returning();
    await tx.update(privacyDeletionExecutions).set({
      status: "completed",
      finishedAt: now,
      deletedCounts,
      updatedAt: now,
    }).where(eq(privacyDeletionExecutions.executionKey, key));
    if (!remains) {
      await writeAuditEvent(tx, {
        organizationId: current.organizationId,
        action: "privacy.deletion_completed",
        entityType: "profile",
        entityId: current.profileId,
        metadata: { changedFields: ["privacy_deletion_request"] },
      });
    }
    return { status: remains ? "scheduled" : "completed", request: updatedRequest, deletedCounts };
  }).catch(async () => {
    try {
      await db.transaction(async (tx) => {
        await tx.update(privacyRequests).set({ status: "failed", failedAt: now, failureCode: SAFE_FAILURE_CODE, updatedAt: now }).where(and(eq(privacyRequests.id, request.id), inArray(privacyRequests.status, ["approved", "scheduled", "failed"])));
        await tx.insert(privacyDeletionExecutions).values({
          organizationId: request.organizationId,
          privacyRequestId: request.id,
          executionKey: executionKey("request-failed", [request.id, now.toISOString()], now),
          policyVersion: request.policyVersion,
          status: "failed",
          batchSize,
          failureCode: SAFE_FAILURE_CODE,
          startedAt: now,
          finishedAt: now,
        }).onConflictDoNothing({ target: privacyDeletionExecutions.executionKey });
        await writeAuditEvent(tx, {
          organizationId: request.organizationId,
          action: "privacy.deletion_failed",
          entityType: "profile",
          entityId: request.profileId,
          result: "unexpected_error",
          metadata: { reasonCodes: [SAFE_FAILURE_CODE] },
        });
      });
    } catch {
      // The scheduler will retry the request if the failure record itself is unavailable.
    }
    return { status: "failed", failureCode: SAFE_FAILURE_CODE };
  });
}

export async function runPrivacyRetention({ db = getDb(), now = new Date(), batchSize = DEFAULT_BATCH_SIZE } = {}) {
  if (!isPrivacyEnabled()) return { status: "disabled" };
  const currentTime = new Date(now);
  const size = boundedBatchSize(batchSize);
  const cutoffs = {
    productAnalytics: monthsAgo(currentTime, PRIVACY_RETENTION.productAnalyticsMonths),
    failureSummaries: monthsAgo(currentTime, PRIVACY_RETENTION.failureSummariesMonths),
    completedPrivacyRequests: monthsAgo(currentTime, PRIVACY_RETENTION.completedPrivacyRequestsMonths),
    supersededConsent: monthsAgo(currentTime, PRIVACY_RETENTION.supersededConsentMonths),
  };
  const global = await db.transaction(async (tx) => {
    await enableRetentionDeletes(tx);
    const heldSubjectKeys = await getHeldSubjectKeys(tx);
    const productAnalytics = await deleteGlobalAnalytics(tx, { cutoff: cutoffs.productAnalytics, batchSize: size, now: currentTime, heldSubjectKeys });
    const failureSummaries = await deleteGlobalFailures(tx, { cutoff: cutoffs.failureSummaries, batchSize: size, now: currentTime, heldSubjectKeys });
    const supersededConsentHistory = await deleteGlobalSupersededConsents(tx, { cutoff: cutoffs.supersededConsent, batchSize: size, now: currentTime });
    const completedPrivacyRequests = await deleteCompletedRequestArtifacts(tx, { cutoff: cutoffs.completedPrivacyRequests, batchSize: size, now: currentTime });
    const unlinkedExecutionArtifacts = await deleteUnlinkedExecutionArtifacts(tx, { cutoff: cutoffs.completedPrivacyRequests, batchSize: size });
    return { productAnalytics, failureSummaries, supersededConsentHistory, completedPrivacyRequests, unlinkedExecutionArtifacts };
  });

  const requests = await db.select().from(privacyRequests)
    .where(inArray(privacyRequests.status, SUBJECT_REQUEST_STATUSES))
    .orderBy(desc(privacyRequests.submittedAt), desc(privacyRequests.id))
    .limit(size);
  const requestResults = [];
  for (const request of requests) requestResults.push(await processSubjectRequest({ db, request, now: currentTime, batchSize: size }));
  return { status: "completed", global, requests: requestResults };
}
