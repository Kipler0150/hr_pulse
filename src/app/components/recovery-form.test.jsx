// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setSession = vi.fn();

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({ auth: { setSession } }),
}));

vi.mock("@/app/components/auth-form", () => ({
  AuthForm: ({ initialState }) => (
    <div data-testid="recovery-form">{initialState?.error ?? "ready"}</div>
  ),
}));

import { RecoveryForm } from "@/app/components/recovery-form";

describe("RecoveryForm", () => {
  beforeEach(() => {
    setSession.mockReset();
    window.history.replaceState({}, "", "/reset-password");
  });

  afterEach(cleanup);

  it("turns a recovery fragment into a cookie session and removes tokens from the URL", async () => {
    setSession.mockResolvedValueOnce({ error: null });
    window.history.replaceState(
      {},
      "",
      "/reset-password?error=access_denied&error_code=otp_expired#access_token=access&refresh_token=refresh&type=recovery",
    );

    render(<StrictMode><RecoveryForm action={vi.fn()} initialState={{ error: "expired" }} /></StrictMode>);

    await waitFor(() => expect(setSession).toHaveBeenCalledWith({
      access_token: "access",
      refresh_token: "refresh",
    }));
    expect(await screen.findByTestId("recovery-form")).toHaveTextContent("ready");
    expect(window.location.pathname).toBe("/reset-password");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
  });

  it("shows the safe expired message when Supabase rejects the fragment session", async () => {
    setSession.mockResolvedValueOnce({ error: { message: "provider detail" } });
    window.history.replaceState(
      {},
      "",
      "/reset-password#access_token=bad&refresh_token=bad&type=recovery",
    );

    render(<RecoveryForm action={vi.fn()} initialState={null} />);

    expect(await screen.findByTestId("recovery-form")).toHaveTextContent(
      "This recovery link is invalid or has expired. Request a new link to continue.",
    );
    expect(screen.queryByText("provider detail")).not.toBeInTheDocument();
    expect(window.location.hash).toBe("");
  });
});
