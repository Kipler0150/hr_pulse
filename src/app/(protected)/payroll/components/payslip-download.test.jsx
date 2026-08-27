// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PayslipDownload } from "./payslip-download";

describe("PayslipDownload", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("requests a no cache private link from the protected endpoint, covers: AC-7 and AC-9", async () => {
    const user = userEvent.setup();
    fetch.mockResolvedValue({ ok: false });
    render(<PayslipDownload payslipId="payslip-id" />);

    await user.click(screen.getByRole("button", { name: "Download payslip" }));

    expect(fetch).toHaveBeenCalledWith("/api/payslips/payslip-id/download", { cache: "no-store" });
  });

  it("shows safe accessible guidance when a private link cannot be created, covers: AC-7 and AC-10", async () => {
    const user = userEvent.setup();
    fetch.mockResolvedValue({ ok: false });
    render(<PayslipDownload payslipId="payslip-id" />);

    await user.click(screen.getByRole("button", { name: "Download payslip" }));

    expect(screen.getByRole("alert")).toHaveTextContent("The payslip link could not be created.");
  });
});
