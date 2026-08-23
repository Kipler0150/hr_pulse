const recoveryErrorMessage = "This recovery link is invalid or has expired. Request a new link to continue.";

export function getRecoveryError(errorCode) {
  return errorCode === "access_denied" || errorCode === "otp_expired"
    ? { error: recoveryErrorMessage }
    : null;
}