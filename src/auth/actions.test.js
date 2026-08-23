import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/auth/access", () => ({ getAccessState: vi.fn(), safeReturnTo: (value) => value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard" }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((path) => { const error = new Error("redirect"); error.digest = `NEXT_REDIRECT;${path}`; throw error; }) }));
vi.mock("next/headers", () => ({ cookies: vi.fn().mockResolvedValue({ set: vi.fn(), delete: vi.fn() }) }));

import { createClient } from "@/lib/supabase/server";
import { getAccessState } from "@/auth/access";
import { cookies } from "next/headers";
import { chooseOrganization, requestPasswordReset, signIn, signOut, updatePassword } from "./actions";

function form(values) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("authentication actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses a generic response for invalid sign in details", async () => {
    createClient.mockReturnValue({ auth: { signInWithPassword: vi.fn().mockResolvedValue({ error: new Error("invalid credentials") }) } });
    const result = await signIn(null, form({ email: "unknown@example.com", password: "wrong" }));
    expect(result.error).toBe("We could not complete that request. Check your details and try again.");
  });

  it("does not reveal account existence in reset requests", async () => {
    createClient.mockReturnValue({ auth: { resetPasswordForEmail: vi.fn().mockResolvedValue({ error: new Error("provider failure") }) } });
    const result = await requestPasswordReset(null, form({ email: "person@example.com" }));
    expect(result.error).toContain("could not send a recovery email");
  });

  it("returns a generic confirmation after a successful reset request", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
    createClient.mockReturnValue({ auth: { resetPasswordForEmail } });
    const result = await requestPasswordReset(null, form({ email: "person@example.com" }));
    expect(result.success).toContain("If an account matches that email");
    expect(resetPasswordForEmail).toHaveBeenCalledWith("person@example.com", {
      redirectTo: "http://localhost:3000/auth/callback?next=/reset-password",
    });
  });

  it("rejects an expired recovery session before changing a password", async () => {
    createClient.mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } });
    const result = await updatePassword(null, form({ password: "newpassword", confirmPassword: "newpassword" }));
    expect(result.error).toContain("recovery link has expired");
  });

  it("redirects a provisioned user to the requested local path", async () => {
    createClient.mockResolvedValue({ auth: { signInWithPassword: vi.fn().mockResolvedValue({ error: null }) } });
    getAccessState.mockResolvedValue({ profile: { status: "active" }, memberships: [{ organizationId: "org-id" }] });

    await expect(signIn(null, form({ email: "person@example.com", password: "password", returnTo: "/reports" }))).rejects.toMatchObject({ digest: "NEXT_REDIRECT;/reports" });
  });

  it("clears the organization cookie when signing out", async () => {
    const cookieStore = { set: vi.fn(), delete: vi.fn() };
    cookies.mockResolvedValue(cookieStore);
    createClient.mockResolvedValue({ auth: { signOut: vi.fn().mockResolvedValue({ error: null }) } });

    await expect(signOut()).rejects.toMatchObject({ digest: "NEXT_REDIRECT;/sign-in" });
    expect(cookieStore.delete).toHaveBeenCalledWith("hr_pulse_organization_id");
  });

  it("rejects organization choices outside the current memberships", async () => {
    createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-id" } } }) } });
    getAccessState.mockResolvedValue({ user: { id: "user-id" }, profile: { status: "active" }, selected: null });

    const result = await chooseOrganization(form({ organizationId: "123e4567-e89b-12d3-a456-426614174000" }));
    expect(result.error).toContain("not available");
  });

  it("logs only an event category and timestamp after a reset request", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    createClient.mockResolvedValue({ auth: { resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }) } });

    await requestPasswordReset(null, form({ email: "person@example.com" }));
    expect(log).toHaveBeenCalledWith("[auth]", expect.objectContaining({ event: "password_reset_requested", at: expect.any(String) }));
    expect(JSON.stringify(log.mock.calls)).not.toContain("person@example.com");
    log.mockRestore();
  });
});