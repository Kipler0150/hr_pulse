import { redirect } from "next/navigation";

import { getAttendanceAccessState } from "@/attendance/access";
import { AppShell } from "@/components/app-shell";
import { getThemePreference } from "@/lib/theme-server";

export default async function AttendanceLayout({ children }) {
  const [state, themePreference] = await Promise.all([getAttendanceAccessState(), getThemePreference()]);
  if (!state.user) redirect("/sign-in");
  if (!state.profile || state.profile.status !== "active") redirect("/pending-access");
  if (!state.selected) redirect("/choose-organization");
  return <AppShell state={state} themePreference={themePreference}>{children}</AppShell>;
}
