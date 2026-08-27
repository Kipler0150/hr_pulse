import { redirect } from "next/navigation";
import { getDashboardState } from "@/auth/actions";
import { AppShell } from "@/components/app-shell";
import { getThemePreference } from "@/lib/theme-server";

export default async function PayrollLayout({ children }) {
  const [state, themePreference] = await Promise.all([getDashboardState(), getThemePreference()]);
  if (!state.user) redirect("/sign-in?returnTo=%2Fpayroll");
  if (!state.profile || state.profile.status !== "active" || !state.selected) redirect("/pending-access");
  if (state.selected.role !== "administrator") redirect("/dashboard");
  return <AppShell state={state} themePreference={themePreference}>{children}</AppShell>;
}
