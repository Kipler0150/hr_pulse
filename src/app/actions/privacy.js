"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { validateUuid } from "@/db/validation";

import { requirePrivacyContext } from "@/privacy/access";
import { saveProductAnalyticsConsent } from "@/privacy/consent";
import { serializePrivacyError, PrivacyError } from "@/privacy/errors";
import {
  changePrivacyHold,
  decideDeletionRequest,
  startDeletionRequestReview,
  submitDeletionRequest,
  withdrawDeletionRequest,
} from "@/privacy/requests";

function text(formData, name) {
  return String(formData?.get(name) ?? "").trim();
}

function idempotencyKey(formData) {
  const value = text(formData, "idempotencyKey");
  try {
    return validateUuid(value, "idempotencyKey");
  } catch {
    throw new PrivacyError("PRIVACY_INVALID_INPUT");
  }
}

function uuidValue(formData, name) {
  try {
    return validateUuid(text(formData, name), name);
  } catch {
    throw new PrivacyError("PRIVACY_INVALID_INPUT");
  }
}

function refreshPrivacyPages() {
  revalidatePath("/settings/privacy");
  revalidatePath("/admin/privacy");
}

function success(result, message) {
  return { success: true, message, result };
}

function failure(error) {
  return { success: false, ...serializePrivacyError(error) };
}

export async function saveProductAnalyticsConsentAction(previousState, formData) {
  try {
    const context = await requirePrivacyContext();
    const grantedValue = text(formData, "granted");
    if (grantedValue !== "true" && grantedValue !== "false") throw new PrivacyError("PRIVACY_INVALID_INPUT");
    const result = await saveProductAnalyticsConsent({
      db: getDb(),
      organizationId: context.organizationId,
      profileId: context.profile.id,
      granted: grantedValue === "true",
      idempotencyKey: idempotencyKey(formData),
    });
    refreshPrivacyPages();
    return success(result, result.replayed ? "Your previous analytics choice is still active." : "Your analytics preference was saved.");
  } catch (error) {
    return failure(error);
  }
}

export async function submitDeletionRequestAction(previousState, formData) {
  try {
    const context = await requirePrivacyContext();
    const result = await submitDeletionRequest({
      db: getDb(),
      organizationId: context.organizationId,
      profileId: context.profile.id,
      idempotencyKey: idempotencyKey(formData),
    });
    refreshPrivacyPages();
    return success(result, result.duplicate ? "You already have an open deletion request." : "Your deletion request was submitted.");
  } catch (error) {
    return failure(error);
  }
}

export async function withdrawDeletionRequestAction(previousState, formData) {
  try {
    const context = await requirePrivacyContext();
    const requestId = uuidValue(formData, "requestId");
    const result = await withdrawDeletionRequest({
      db: getDb(),
      organizationId: context.organizationId,
      profileId: context.profile.id,
      requestId,
      idempotencyKey: idempotencyKey(formData),
    });
    refreshPrivacyPages();
    return success(result, result.replayed ? "Your previous withdrawal is still active." : "Your deletion request was withdrawn.");
  } catch (error) {
    return failure(error);
  }
}

export async function decideDeletionRequestAction(previousState, formData) {
  try {
    const context = await requirePrivacyContext({ administrator: true });
    const requestId = uuidValue(formData, "requestId");
    const decision = text(formData, "decision");
    const result = await decideDeletionRequest({
      db: getDb(),
      organizationId: context.organizationId,
      administratorProfileId: context.profile.id,
      requestId,
      decision,
      idempotencyKey: idempotencyKey(formData),
    });
    refreshPrivacyPages();
    return success(result, result.replayed ? "The previous review decision is still active." : `Request ${decision}.`);
  } catch (error) {
    return failure(error);
  }
}

export async function startDeletionRequestReviewAction(previousState, formData) {
  try {
    const context = await requirePrivacyContext({ administrator: true });
    const result = await startDeletionRequestReview({
      db: getDb(),
      organizationId: context.organizationId,
      administratorProfileId: context.profile.id,
      requestId: uuidValue(formData, "requestId"),
      idempotencyKey: idempotencyKey(formData),
    });
    refreshPrivacyPages();
    return success(result, result.replayed ? "The request is already under review." : "The request is now under review.");
  } catch (error) {
    return failure(error);
  }
}

export async function changePrivacyHoldAction(previousState, formData) {
  try {
    const context = await requirePrivacyContext({ administrator: true });
    const profileId = uuidValue(formData, "profileId");
    const action = text(formData, "action");
    const result = await changePrivacyHold({
      db: getDb(),
      organizationId: context.organizationId,
      administratorProfileId: context.profile.id,
      profileId,
      action,
      idempotencyKey: idempotencyKey(formData),
    });
    refreshPrivacyPages();
    return success(result, action === "place" ? "The legal hold was placed." : "The legal hold was released.");
  } catch (error) {
    return failure(error);
  }
}
