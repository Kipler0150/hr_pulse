const LOCAL_ANALYTICS_SECRET = "hr-pulse-privacy-analytics-local-secret-32";

export const PRIVACY_POLICY_VERSION = "2026-09-03-v1";
export const PRIVACY_RETENTION = Object.freeze({
  productAnalyticsMonths: 12,
  failureSummariesMonths: 12,
  completedPrivacyRequestsMonths: 24,
  supersededConsentMonths: 24,
});

export function isPrivacyEnabled() {
  return process.env.HR_PULSE_PRIVACY_ENABLED === "true";
}

export function getPrivacyAnalyticsSecret() {
  const value = process.env.HR_PULSE_PRIVACY_ANALYTICS_SECRET;
  if (value && Buffer.byteLength(value, "utf8") >= 32) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("HR_PULSE_PRIVACY_ANALYTICS_SECRET is required");
  }
  return value || LOCAL_ANALYTICS_SECRET;
}

export function assertPrivacyEnabled() {
  if (!isPrivacyEnabled()) {
    const error = new Error("Privacy controls are disabled");
    error.code = "PRIVACY_DISABLED";
    throw error;
  }
}

