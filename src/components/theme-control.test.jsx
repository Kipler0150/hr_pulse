// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/theme", () => ({ setTheme: vi.fn() }));

import { ThemeControl } from "@/components/theme-control";

describe("ThemeControl", () => {
  afterEach(cleanup);

  it("renders all server submit choices with the selected state, covers: AC-2", () => {
    render(<ThemeControl preference="dark" />);

    expect(screen.getByRole("group", { name: "Color theme" })).toBeVisible();
    expect(screen.getByRole("button", { name: "System theme" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Light theme" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Dark theme" })).toHaveAttribute("aria-pressed", "true");
  });
});
