import { redirect } from "next/navigation";

import { getDashboardState } from "@/auth/actions";
import { AppShell } from "@/components/app-shell";
import { getThemePreference } from "@/lib/theme-server";
import { assertOvertimeEnabled } from "@/overtime/config";

export default async function TimecardsLayout({ children }) {
  assertOvertimeEnabled();
  const [state, themePreference] = await Promise.all([getDashboardState(), getThemePreference()]);
  if (!state.user) redirect("/sign-in?returnTo=%2Ftimecards");
  if (!state.profile || state.profile.status !== "active" || !state.selected) redirect("/pending-access");
  return <AppShell state={state} themePreference={themePreference}>{children}</AppShell>;
}
