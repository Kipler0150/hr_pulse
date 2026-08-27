export const THEME_COOKIE = "hr_pulse_theme";
export const THEME_VALUES = ["system", "light", "dark"];

export function normalizeTheme(value) {
  return THEME_VALUES.includes(value) ? value : "system";
}
