// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { SensitiveValue } from "@/components/ui/sensitive-value";

describe("SensitiveValue", () => {
  afterEach(cleanup);

  it("denies reveal by default, covers: AC-9", () => {
    render(<SensitiveValue value="PHP 42,673.50" />);

    expect(screen.getByText("••••••")).toBeVisible();
    expect(screen.getByText("Sensitive value hidden")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reveal sensitive value/i })).not.toBeInTheDocument();
    expect(screen.queryByText("PHP 42,673.50")).not.toBeInTheDocument();
  });

  it("reveals and hides only when authorization is supplied, covers: AC-9", async () => {
    const user = userEvent.setup();
    render(<SensitiveValue canReveal value="PHP 42,673.50" />);

    const reveal = screen.getByRole("button", { name: "Reveal sensitive value" });
    await user.click(reveal);
    expect(screen.getAllByText("PHP 42,673.50")[0]).toBeVisible();
    expect(screen.getByRole("button", { name: "Hide sensitive value" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Hide sensitive value" }));
    expect(screen.getByText("••••••")).toBeVisible();
  });
});
