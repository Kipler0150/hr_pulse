import { describe, expect, it } from "vitest";

import { normalizeTheme, THEME_COOKIE, THEME_VALUES } from "@/lib/theme";

describe("theme preference", () => {
  it("accepts every supported preference, covers: AC-2", () => {
    expect(THEME_VALUES.map(normalizeTheme)).toEqual(["system", "light", "dark"]);
  });

  it("falls back to system for malformed values, covers: AC-2", () => {
    expect(normalizeTheme("sepia")).toBe("system");
    expect(normalizeTheme(undefined)).toBe("system");
  });

  it("uses the stable cookie name, covers: AC-2", () => {
    expect(THEME_COOKIE).toBe("hr_pulse_theme");
  });
});
