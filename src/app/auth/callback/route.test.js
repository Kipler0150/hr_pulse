import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();
const createClient = vi.fn(async () => ({ auth: { exchangeCodeForSession, verifyOtp } }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args) => createClient(...args),
}));

function callbackUrl(query = "") {
  return new Request(`http://localhost:3000/auth/callback${query}`);
}

async function getLocation(response) {
  return new URL(response.headers.get("location"));
}

describe("auth callback route", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    verifyOtp.mockReset();
    createClient.mockClear();
  });

  it("rejects a request with no usable recovery credentials", async () => {
    const { GET } = await import("./route");

    const response = await GET(callbackUrl());
    const location = await getLocation(response);

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/dashboard");
    expect(location.searchParams.get("error_code")).toBe("otp_expired");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("verifies a stateless token hash recovery link and lands cleanly", async () => {
    const { GET } = await import("./route");
    verifyOtp.mockResolvedValueOnce({ error: null });

    const response = await GET(callbackUrl("?token_hash=abc123&type=recovery&next=/reset-password"));
    const location = await getLocation(response);

    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "abc123", type: "recovery" });
    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/reset-password");
    expect(location.searchParams.has("error_code")).toBe(false);
  });

  it("marks a rejected token hash as an expired link", async () => {
    const { GET } = await import("./route");
    verifyOtp.mockResolvedValueOnce({ error: { message: "invalid token" } });

    const response = await GET(callbackUrl("?token_hash=bad&type=recovery&next=/reset-password"));
    const location = await getLocation(response);

    expect(location.pathname).toBe("/reset-password");
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("error_code")).toBe("otp_expired");
  });

  it("ignores unsupported token types instead of calling the provider", async () => {
    const { GET } = await import("./route");

    const response = await GET(callbackUrl("?token_hash=abc&type=sms&next=/reset-password"));
    const location = await getLocation(response);

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(location.searchParams.get("error_code")).toBe("otp_expired");
  });

  it("still exchanges a PKCE code when the link provides one", async () => {
    const { GET } = await import("./route");
    exchangeCodeForSession.mockResolvedValueOnce({ error: null });

    const response = await GET(callbackUrl("?code=pkce-code&next=/reset-password"));
    const location = await getLocation(response);

    expect(exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(location.pathname).toBe("/reset-password");
    expect(location.searchParams.has("error_code")).toBe(false);
  });
});
