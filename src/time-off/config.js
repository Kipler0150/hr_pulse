export function isTimeOffEnabled() {
  if (process.env.HR_PULSE_TIME_OFF_ENABLED === "true") return true;
  return process.env.NODE_ENV !== "production" && process.env.HR_PULSE_TIME_OFF_ENABLED !== "false";
}

export function assertTimeOffEnabled() {
  if (!isTimeOffEnabled()) throw new TimeOffError("TIME_OFF_DISABLED");
}

export class TimeOffError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "TimeOffError";
    this.code = code;
    this.details = details;
  }
}

export const TIME_OFF_ERROR_CATALOG = Object.freeze({
  TIME_OFF_DISABLED: ["Time off is not available.", "Ask an administrator to enable the time off feature."],
  TIME_OFF_FORBIDDEN: ["You do not have permission to use time off.", "Use an active account with access in this organization."],
  TIME_OFF_UNAVAILABLE: ["This time off request is not available.", "Return to your time off list and refresh."],
  TIME_OFF_INVALID_DATE_RANGE: ["The requested dates are invalid.", "Choose a start on or after today and a range of no more than 366 calendar days."],
  TIME_OFF_OUTSIDE_EMPLOYMENT: ["The requested dates fall outside active employment.", "Choose dates on or after hire and before termination."],
  TIME_OFF_INVALID_TYPE: ["The time off type is invalid.", "Choose paid, unpaid, sick, or other."],
  TIME_OFF_INVALID_REASON: ["The employee reason is invalid.", "Use plain text of no more than 500 characters."],
  TIME_OFF_OVERLAP: ["These dates overlap another active request.", "Review submitted or approved requests before trying again."],
  TIME_OFF_INVALID_NOTE: ["A valid decline note is required.", "Enter 1 through 500 plain text characters."],
  TIME_OFF_FALLBACK_REASON_REQUIRED: ["An administrator override reason is required.", "Enter 1 through 500 plain text characters."],
  TIME_OFF_INACTIVE_EMPLOYEE: ["This request cannot be approved for an inactive employee.", "Decline it with an explanation if it should be closed."],
  TIME_OFF_STALE_VERSION: ["This request changed before your action completed.", "Refresh and review the current state."],
  TIME_OFF_INVALID_STATE: ["This action is not available for the current request state.", "Refresh and use an action shown on the request."],
  TIME_OFF_RETRY_CONFLICT: ["This retry does not match the original request.", "Refresh the page and submit the current action again."],
  TIME_OFF_INVALID_FILTER: ["A time off filter is invalid.", "Reset the filters and try again."],
  TIME_OFF_INVALID_CURSOR: ["This time off page link is invalid.", "Return to the first page with the current filters."],
  TIME_OFF_INVALID_VERSION: ["The request version is invalid.", "Refresh the request before acting."],
  TIME_OFF_INVALID_RETRY_ID: ["The retry identity is invalid.", "Reload the form and try again."],
  TIME_OFF_REQUEST_FAILED: ["Time off could not be updated.", "Refresh the current state and try again."]
});

export function serializeTimeOffError(error) {
  const code = error instanceof TimeOffError && TIME_OFF_ERROR_CATALOG[error.code] ? error.code : "TIME_OFF_REQUEST_FAILED";
  const [message, guidance] = TIME_OFF_ERROR_CATALOG[code];
  return { code, message, guidance, retryable: code === "TIME_OFF_REQUEST_FAILED" };
}
