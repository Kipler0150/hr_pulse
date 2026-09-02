export const SELF_SERVICE_ERROR_CATALOG = Object.freeze({
  SELF_SERVICE_DISABLED: ["This page is not available.", "Return to your workspace and try again later."],
  SELF_SERVICE_ACCESS_UNAVAILABLE: ["Your employee access is not ready.", "Ask an administrator to link your active employee record."],
  SELF_SERVICE_NOT_FOUND: ["This record is not available.", "Return to your self service home and try again."],
  SELF_SERVICE_INVALID_CURSOR: ["This page link is invalid.", "Return to the first page and try again."],
  SELF_SERVICE_INVALID_INPUT: ["Check the highlighted profile details.", "Use a preferred name of 1 to 200 characters and an E.164 phone number."],
  SELF_SERVICE_STALE: ["Your profile changed before this save completed.", "Refresh the page, keep your changes, and try again."],
  SELF_SERVICE_RETRY_CONFLICT: ["This save cannot be replayed.", "Refresh the page and submit your current changes again."],
  SELF_SERVICE_UNAVAILABLE: ["Self service is temporarily unavailable.", "Refresh the page and try again."],
});

export class SelfServiceError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "SelfServiceError";
    this.code = SELF_SERVICE_ERROR_CATALOG[code] ? code : "SELF_SERVICE_UNAVAILABLE";
    this.details = details;
  }
}

export function serializeSelfServiceError(error) {
  const code = error instanceof SelfServiceError ? error.code : "SELF_SERVICE_UNAVAILABLE";
  const [message, guidance] = SELF_SERVICE_ERROR_CATALOG[code];
  return { code, message, guidance };
}
