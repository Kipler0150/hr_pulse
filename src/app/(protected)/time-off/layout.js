import { notFound, redirect } from "next/navigation";
import { getAttendanceAccessState } from "@/attendance/access";
import { AppShell } from "@/components/app-shell";
import { getThemePreference } from "@/lib/theme-server";
import { isTimeOffEnabled } from "@/time-off/config";

export default async function TimeOffLayout({ children }) {
  if (!isTimeOffEnabled()) notFound();
  const [state, themePreference] = await Promise.all([getAttendanceAccessState(), getThemePreference()]);
  if (!state.user) redirect("/sign-in");
  if (!state.profile || state.profile.status !== "active") redirect("/pending-access");
  if (!state.selected) redirect("/choose-organization");
  return <AppShell state={state} themePreference={themePreference}>{children}</AppShell>;
}
