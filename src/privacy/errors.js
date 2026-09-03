const PRIVACY_ERRORS = Object.freeze({
  PRIVACY_DISABLED: "Privacy controls are not available.",
  PRIVACY_FORBIDDEN: "Privacy controls are not available for this workspace.",
  PRIVACY_INVALID_INPUT: "Check the privacy request and try again.",
  PRIVACY_REQUEST_EXISTS: "You already have an open deletion request.",
  PRIVACY_NOT_FOUND: "That privacy request is not available.",
  PRIVACY_INVALID_STATE: "That privacy request cannot be changed in its current state.",
  PRIVACY_IDEMPOTENCY_CONFLICT: "This retry does not match the original request.",
  PRIVACY_HOLD_EXISTS: "This profile already has an active legal hold.",
  PRIVACY_HOLD_NOT_FOUND: "That legal hold is not available.",
  PRIVACY_UNAVAILABLE: "Privacy controls are temporarily unavailable.",
  PRIVACY_RETENTION_UNAVAILABLE: "Privacy retention is temporarily unavailable.",
});

export class PrivacyError extends Error {
  constructor(code, cause = null) {
    super(PRIVACY_ERRORS[code] ?? PRIVACY_ERRORS.PRIVACY_UNAVAILABLE);
    this.name = "PrivacyError";
    this.code = PRIVACY_ERRORS[code] ? code : "PRIVACY_UNAVAILABLE";
    this.cause = cause;
  }
}

export function serializePrivacyError(error) {
  const safe = error instanceof PrivacyError
    ? error
    : error?.code === "PRIVACY_DISABLED"
      ? new PrivacyError("PRIVACY_DISABLED")
      : new PrivacyError("PRIVACY_UNAVAILABLE");
  return { code: safe.code, message: safe.message };
}
