import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";

import { getDb } from "@/db";
import { encodeCursor, decodeCursor, validateUuid } from "@/db/validation";
import { memberships, privacyHolds, privacyRequests } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";

import { PRIVACY_POLICY_VERSION } from "./config";
import { PrivacyError } from "./errors";

const OPEN_REQUEST_STATUSES = ["submitted", "under_review", "approved", "scheduled", "failed"];
const DECISION_STATUSES = new Set(["approved", "rejected"]);

function assertKey(value) {
  validateUuid(value, "idempotencyKey");
  return value;
}

function requestView(row, hold = null) {
  if (!row) return null;
  return {
    id: row.id,
    profileId: row.profileId,
    requestType: row.requestType,
    status: row.status,
    resolutionCode: row.resolutionCode,
    policyVersion: row.policyVersion,
    submittedAt: row.submittedAt,
    reviewedAt: row.reviewedAt,
    scheduledAt: row.scheduledAt,
    completedAt: row.completedAt,
    failedAt: row.failedAt,
    failureCode: row.failureCode,
    deletedCounts: row.deletedCounts,
    holdStatus: hold?.active ? "active" : "none",
  };
}

function cursorCondition(cursor) {
  if (!cursor) return null;
  const [timestamp, id] = decodeCursor(cursor, 2);
  validateUuid(id, "cursor");
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new PrivacyError("PRIVACY_INVALID_INPUT");
  return or(
    lt(privacyRequests.submittedAt, date),
    and(eq(privacyRequests.submittedAt, date), lt(privacyRequests.id, id)),
  );
}

export async function listPrivacyRequests({ db = getDb(), organizationId, profileId = null, admin = false, cursor = null, limit = 20 }) {
  validateUuid(organizationId, "organizationId");
  if (profileId) validateUuid(profileId, "profileId");
  if (!admin && !profileId) throw new PrivacyError("PRIVACY_FORBIDDEN");
  const pageSize = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const conditions = [eq(privacyRequests.organizationId, organizationId)];
  if (!admin) conditions.push(eq(privacyRequests.profileId, profileId));
  const after = cursorCondition(cursor);
  if (after) conditions.push(after);
  const rows = await db.select().from(privacyRequests)
    .where(and(...conditions))
    .orderBy(desc(privacyRequests.submittedAt), desc(privacyRequests.id))
    .limit(pageSize + 1);
  const hasMore = rows.length > pageSize;
  const visibleRows = rows.slice(0, pageSize);
  const holds = visibleRows.length ? await db.select().from(privacyHolds).where(and(
    eq(privacyHolds.organizationId, organizationId),
    inArray(privacyHolds.profileId, [...new Set(visibleRows.map((row) => row.profileId))]),
    eq(privacyHolds.active, true),
  )) : [];
  const holdsByProfile = new Map(holds.map((hold) => [hold.profileId, hold]));
  return {
    rows: visibleRows.map((row) => requestView(row, holdsByProfile.get(row.profileId))),
    nextCursor: hasMore ? encodeCursor([visibleRows.at(-1).submittedAt.toISOString(), visibleRows.at(-1).id]) : null,
  };
}

export async function getPrivacyRequest({ db = getDb(), organizationId, requestId, profileId = null, admin = false }) {
  validateUuid(organizationId, "organizationId");
  validateUuid(requestId, "requestId");
  if (profileId) validateUuid(profileId, "profileId");
  const conditions = [eq(privacyRequests.organizationId, organizationId), eq(privacyRequests.id, requestId)];
  if (!admin) conditions.push(eq(privacyRequests.profileId, profileId));
  const [row] = await db.select().from(privacyRequests).where(and(...conditions)).limit(1);
  if (!row) throw new PrivacyError("PRIVACY_NOT_FOUND");
  const [hold] = await db.select().from(privacyHolds).where(and(
    eq(privacyHolds.organizationId, organizationId),
    eq(privacyHolds.profileId, row.profileId),
    eq(privacyHolds.active, true),
  )).limit(1);
  return requestView(row, hold);
}

export async function submitDeletionRequest({ db = getDb(), organizationId, profileId, idempotencyKey, policyVersion = PRIVACY_POLICY_VERSION }) {
  validateUuid(organizationId, "organizationId");
  validateUuid(profileId, "profileId");
  const key = assertKey(idempotencyKey);
  if (policyVersion !== PRIVACY_POLICY_VERSION) throw new PrivacyError("PRIVACY_INVALID_INPUT");
  try {
    return await db.transaction(async (tx) => {
      const [replayed] = await tx.select().from(privacyRequests).where(and(
        eq(privacyRequests.organizationId, organizationId),
        eq(privacyRequests.profileId, profileId),
        eq(privacyRequests.idempotencyKey, key),
      )).limit(1);
      if (replayed) return { request: requestView(replayed), replayed: true, duplicate: false };
      const [existing] = await tx.select().from(privacyRequests).where(and(
        eq(privacyRequests.organizationId, organizationId),
        eq(privacyRequests.profileId, profileId),
        inArray(privacyRequests.status, OPEN_REQUEST_STATUSES),
      )).orderBy(desc(privacyRequests.submittedAt)).limit(1);
      if (existing) return { request: requestView(existing), replayed: false, duplicate: true };
      const [request] = await tx.insert(privacyRequests).values({
        organizationId,
        profileId,
        requestType: "deletion",
        status: "submitted",
        policyVersion,
        idempotencyKey: key,
      }).returning();
      await writeAuditEvent(tx, {
        organizationId,
        actorProfileId: profileId,
        action: "privacy.deletion_requested",
        entityType: "profile",
        entityId: profileId,
        metadata: { changedFields: ["privacy_deletion_request"] },
      });
      return { request: requestView(request), replayed: false, duplicate: false };
    });
  } catch (error) {
    if (error instanceof PrivacyError) throw error;
    if (error?.code === "23505") {
      const [existing] = await db.select().from(privacyRequests).where(and(
        eq(privacyRequests.organizationId, organizationId),
        eq(privacyRequests.profileId, profileId),
        inArray(privacyRequests.status, OPEN_REQUEST_STATUSES),
      )).orderBy(desc(privacyRequests.submittedAt)).limit(1);
      if (existing) return { request: requestView(existing), replayed: false, duplicate: true };
    }
    throw new PrivacyError("PRIVACY_UNAVAILABLE", error);
  }
}

export async function withdrawDeletionRequest({ db = getDb(), organizationId, profileId, requestId, idempotencyKey }) {
  validateUuid(organizationId, "organizationId");
  validateUuid(profileId, "profileId");
  validateUuid(requestId, "requestId");
  const key = assertKey(idempotencyKey);
  try {
    return await db.transaction(async (tx) => {
      const [request] = await tx.select().from(privacyRequests).where(and(
        eq(privacyRequests.organizationId, organizationId),
        eq(privacyRequests.id, requestId),
        eq(privacyRequests.profileId, profileId),
      )).limit(1);
      if (!request) throw new PrivacyError("PRIVACY_NOT_FOUND");
      if (request.lastActionIdempotencyKey === key && request.status === "rejected" && request.resolutionCode === "employee_withdrawn") return { request: requestView(request), replayed: true };
      if (!["submitted", "under_review"].includes(request.status)) throw new PrivacyError("PRIVACY_INVALID_STATE");
      const now = new Date();
      const [updated] = await tx.update(privacyRequests).set({
        status: "rejected",
        resolutionCode: "employee_withdrawn",
        reviewedAt: now,
        lastActionIdempotencyKey: key,
        updatedAt: now,
      }).where(and(eq(privacyRequests.id, requestId), inArray(privacyRequests.status, ["submitted", "under_review"]))).returning();
      if (!updated) throw new PrivacyError("PRIVACY_INVALID_STATE");
      await writeAuditEvent(tx, { organizationId, actorProfileId: profileId, action: "privacy.deletion_withdrawn", entityType: "profile", entityId: profileId, metadata: { changedFields: ["privacy_deletion_request"] } });
      return { request: requestView(updated), replayed: false };
    });
  } catch (error) {
    if (error instanceof PrivacyError) throw error;
    throw new PrivacyError("PRIVACY_UNAVAILABLE", error);
  }
}

export async function startDeletionRequestReview({ db = getDb(), organizationId, administratorProfileId, requestId, idempotencyKey }) {
  validateUuid(organizationId, "organizationId");
  validateUuid(administratorProfileId, "administratorProfileId");
  validateUuid(requestId, "requestId");
  const key = assertKey(idempotencyKey);
  try {
    return await db.transaction(async (tx) => {
      const [request] = await tx.select().from(privacyRequests).where(and(
        eq(privacyRequests.organizationId, organizationId),
        eq(privacyRequests.id, requestId),
      )).limit(1);
      if (!request) throw new PrivacyError("PRIVACY_NOT_FOUND");
      if (request.lastActionIdempotencyKey === key && request.status === "under_review") return { request: requestView(request), replayed: true };
      if (request.status !== "submitted") throw new PrivacyError("PRIVACY_INVALID_STATE");
      const now = new Date();
      const [updated] = await tx.update(privacyRequests).set({
        status: "under_review",
        reviewedAt: now,
        reviewedByProfileId: administratorProfileId,
        lastActionIdempotencyKey: key,
        updatedAt: now,
      }).where(and(eq(privacyRequests.id, requestId), eq(privacyRequests.status, "submitted"))).returning();
      if (!updated) throw new PrivacyError("PRIVACY_INVALID_STATE");
      await writeAuditEvent(tx, { organizationId, actorProfileId: administratorProfileId, action: "privacy.request_review_started", entityType: "profile", entityId: request.profileId, metadata: { changedFields: ["privacy_request_review"] } });
      return { request: requestView(updated), replayed: false };
    });
  } catch (error) {
    if (error instanceof PrivacyError) throw error;
    throw new PrivacyError("PRIVACY_UNAVAILABLE", error);
  }
}

export async function decideDeletionRequest({ db = getDb(), organizationId, administratorProfileId, requestId, decision, idempotencyKey }) {
  validateUuid(organizationId, "organizationId");
  validateUuid(administratorProfileId, "administratorProfileId");
  validateUuid(requestId, "requestId");
  const key = assertKey(idempotencyKey);
  if (!DECISION_STATUSES.has(decision)) throw new PrivacyError("PRIVACY_INVALID_INPUT");
  try {
    return await db.transaction(async (tx) => {
      const [request] = await tx.select().from(privacyRequests).where(and(eq(privacyRequests.organizationId, organizationId), eq(privacyRequests.id, requestId))).limit(1);
      if (!request) throw new PrivacyError("PRIVACY_NOT_FOUND");
      if (request.lastActionIdempotencyKey === key && request.status === decision) return { request: requestView(request), replayed: true };
      if (request.status !== "under_review") throw new PrivacyError("PRIVACY_INVALID_STATE");
      const now = new Date();
      const [updated] = await tx.update(privacyRequests).set({
        status: decision,
        resolutionCode: decision === "rejected" ? "administrator_rejected" : null,
        reviewedAt: now,
        reviewedByProfileId: administratorProfileId,
        scheduledAt: null,
        lastActionIdempotencyKey: key,
        updatedAt: now,
      }).where(and(eq(privacyRequests.id, requestId), inArray(privacyRequests.status, ["submitted", "under_review"]))).returning();
      if (!updated) throw new PrivacyError("PRIVACY_INVALID_STATE");
      await writeAuditEvent(tx, { organizationId, actorProfileId: administratorProfileId, action: "privacy.request_decided", entityType: "profile", entityId: request.profileId, metadata: { changedFields: ["privacy_request_status"] } });
      return { request: requestView(updated), replayed: false };
    });
  } catch (error) {
    if (error instanceof PrivacyError) throw error;
    throw new PrivacyError("PRIVACY_UNAVAILABLE", error);
  }
}

export async function changePrivacyHold({ db = getDb(), organizationId, administratorProfileId, profileId, action, idempotencyKey }) {
  validateUuid(organizationId, "organizationId");
  validateUuid(administratorProfileId, "administratorProfileId");
  validateUuid(profileId, "profileId");
  const key = assertKey(idempotencyKey);
  if (!["place", "release"].includes(action)) throw new PrivacyError("PRIVACY_INVALID_INPUT");
  try {
    return await db.transaction(async (tx) => {
      const [targetMembership] = await tx.select({ id: memberships.id }).from(memberships).where(and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.profileId, profileId),
      )).limit(1);
      if (!targetMembership) throw new PrivacyError("PRIVACY_NOT_FOUND");
      const [replayed] = await tx.select().from(privacyHolds).where(and(
        eq(privacyHolds.organizationId, organizationId),
        eq(privacyHolds.profileId, profileId),
        eq(privacyHolds.lastActionIdempotencyKey, key),
      )).orderBy(desc(privacyHolds.updatedAt)).limit(1);
      if (replayed) {
        if ((action === "place" && replayed.active) || (action === "release" && !replayed.active)) return { hold: replayed, replayed: true };
        throw new PrivacyError("PRIVACY_IDEMPOTENCY_CONFLICT");
      }
      const [active] = await tx.select().from(privacyHolds).where(and(eq(privacyHolds.organizationId, organizationId), eq(privacyHolds.profileId, profileId), eq(privacyHolds.active, true))).limit(1);
      const now = new Date();
      if (action === "place") {
        if (active) {
          if (active.lastActionIdempotencyKey === key) return { hold: active, replayed: true };
          throw new PrivacyError("PRIVACY_HOLD_EXISTS");
        }
        const [hold] = await tx.insert(privacyHolds).values({ organizationId, profileId, placedByProfileId: administratorProfileId, lastActionIdempotencyKey: key, placedAt: now }).returning();
        await writeAuditEvent(tx, { organizationId, actorProfileId: administratorProfileId, action: "privacy.hold_placed", entityType: "profile", entityId: profileId, metadata: { changedFields: ["privacy_hold"] } });
        return { hold, replayed: false };
      }
      if (!active) throw new PrivacyError("PRIVACY_HOLD_NOT_FOUND");
      if (active.lastActionIdempotencyKey === key) return { hold: active, replayed: true };
      const [hold] = await tx.update(privacyHolds).set({ active: false, releasedAt: now, releasedByProfileId: administratorProfileId, lastActionIdempotencyKey: key, updatedAt: now }).where(and(eq(privacyHolds.id, active.id), eq(privacyHolds.active, true))).returning();
      if (!hold) throw new PrivacyError("PRIVACY_INVALID_STATE");
      await writeAuditEvent(tx, { organizationId, actorProfileId: administratorProfileId, action: "privacy.hold_released", entityType: "profile", entityId: profileId, metadata: { changedFields: ["privacy_hold"] } });
      return { hold, replayed: false };
    });
  } catch (error) {
    if (error instanceof PrivacyError) throw error;
    throw new PrivacyError("PRIVACY_UNAVAILABLE", error);
  }
}

export async function hasActivePrivacyHold({ db = getDb(), organizationId, profileId }) {
  validateUuid(organizationId, "organizationId");
  validateUuid(profileId, "profileId");
  const [hold] = await db.select({ id: privacyHolds.id }).from(privacyHolds).where(and(eq(privacyHolds.organizationId, organizationId), eq(privacyHolds.profileId, profileId), eq(privacyHolds.active, true))).limit(1);
  return Boolean(hold);
}
