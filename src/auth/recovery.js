const recoveryErrorMessage = "This recovery link is invalid or has expired. Request a new link to continue.";

export function getRecoveryError(errorCode) {
  return errorCode ? { error: recoveryErrorMessage } : null;
}

export function getRecoverySessionFromHash(hash) {
  const params = new URLSearchParams(String(hash ?? "").replace(/^#/, ""));
  if (params.get("type") !== "recovery") return null;

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return { error: recoveryErrorMessage };

  return {
    session: {
      access_token: accessToken,
      refresh_token: refreshToken,
    },
  };
}
