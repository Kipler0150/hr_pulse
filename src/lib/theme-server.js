import { cookies } from "next/headers";

import { normalizeTheme, THEME_COOKIE } from "@/lib/theme";

export async function getThemePreference() {
  const cookieStore = await cookies();
  return normalizeTheme(cookieStore.get(THEME_COOKIE)?.value);
}
