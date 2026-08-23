// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils", () => ({
  cn: (...classes) => classes.filter(Boolean).join(" "),
}), { virtual: true });

import { Button } from "./button";

describe("Button", () => {
  afterEach(cleanup);

  it("renders its accessible label", () => {
    render(<Button>Save changes</Button>);

    expect(screen.getByRole("button", { name: "Save changes" })).toBeVisible();
  });

  it("preserves the disabled state", () => {
    render(<Button disabled>Save changes</Button>);

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });
});