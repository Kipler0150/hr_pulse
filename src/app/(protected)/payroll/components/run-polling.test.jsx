// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { RunPolling } from "./run-polling";

describe("RunPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
    mocks.refresh.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("polls the narrow status route and refreshes when processing completes, covers: AC-5 and AC-10", async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ status: "completed" }) });
    render(<RunPolling initialStatus="processing" runId="run-id" />);

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

    expect(fetch).toHaveBeenCalledWith("/api/payroll-runs/run-id/status", { cache: "no-store" });
    expect(screen.getByText("completed")).toBeVisible();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps the last known state and accessible warning during a network failure, covers: AC-5 and AC-10", async () => {
    fetch.mockRejectedValue(new Error("network unavailable"));
    render(<RunPolling initialStatus="queued" runId="run-id" />);

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

    expect(screen.getByText("queued")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Status connection interrupted");
    expect(screen.getByText("Showing the last known state. Automatic checks will continue.")).toBeVisible();
  });

  it("refreshes when delayed or recovery eligibility changes without a status change", async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ status: "processing", delayed: true, recoveryEligible: true }) });
    render(<RunPolling initialStatus="processing" runId="run-id" />);

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("offers a keyboard operable manual refresh, covers: AC-10", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<RunPolling initialStatus="completed" runId="run-id" />);

    const button = screen.getByRole("button", { name: "Refresh status" });
    button.focus();
    await user.keyboard("{Enter}");

    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
