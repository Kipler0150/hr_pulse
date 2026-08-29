// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAttendanceEnabled: vi.fn(),
}));

vi.mock("@/attendance/config", () => ({ isAttendanceEnabled: mocks.isAttendanceEnabled }));
vi.mock("@/auth/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/components/brand-mark", () => ({ BrandMark: () => <div>HR Pulse</div> }));
vi.mock("@/components/theme-control", () => ({ ThemeControl: () => <div>Theme</div> }));
vi.mock("@/components/mobile-navigation", () => ({
  MobileNavigation: ({ attendance }) => <output data-testid="mobile-attendance">{attendance ?? "hidden"}</output>,
}));

import { AppShell } from "./app-shell";

function appState(role) {
  const selected = {
    organization: { name: "Acme" },
    role,
  };
  return {
    memberships: [selected],
    profile: { displayName: "Alex" },
    selected,
    user: { email: "alex@example.test" },
  };
}

describe("AppShell attendance navigation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.isAttendanceEnabled.mockReturnValue(true);
  });
  afterEach(cleanup);

  it.each([
    ["employee", "/attendance"],
    ["manager", "/attendance/review"],
    ["administrator", "/attendance/review"],
  ])("routes the %s role to its authorized attendance surface, covers: AC-5 and AC-6", (role, href) => {
    render(<AppShell state={appState(role)} themePreference="system"><div>Content</div></AppShell>);

    expect(screen.getByRole("link", { name: "Attendance" })).toHaveAttribute("href", href);
    expect(screen.getByTestId("mobile-attendance")).toHaveTextContent(href);
  });

  it("hides attendance navigation when the beta is disabled, covers: AC-7", () => {
    mocks.isAttendanceEnabled.mockReturnValue(false);
    render(<AppShell state={appState("employee")} themePreference="system"><div>Content</div></AppShell>);

    expect(screen.queryByRole("link", { name: "Attendance" })).not.toBeInTheDocument();
    expect(screen.getByTestId("mobile-attendance")).toHaveTextContent("hidden");
  });
});
