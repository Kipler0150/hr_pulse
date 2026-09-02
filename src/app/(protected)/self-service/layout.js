import { notFound, redirect } from "next/navigation";

import { getDashboardState } from "@/auth/actions";
import { AppShell } from "@/components/app-shell";
import { getThemePreference } from "@/lib/theme-server";
import { requireSelfServiceContext } from "@/self-service/access";
import { SelfServiceError } from "@/self-service/errors";

export const dynamic = "force-dynamic";

export default async function SelfServiceLayout({ children }) {
  try {
    await requireSelfServiceContext();
  } catch (error) {
    if (error instanceof SelfServiceError && error.code === "SELF_SERVICE_DISABLED") notFound();
    if (error instanceof SelfServiceError && error.code === "SELF_SERVICE_ACCESS_UNAVAILABLE") redirect("/pending-access");
    if (error instanceof SelfServiceError && error.code === "SELF_SERVICE_UNAVAILABLE") return <main role="alert" className="mx-auto flex min-h-64 max-w-2xl flex-col justify-center gap-4 px-4"><h1 className="text-3xl font-semibold tracking-tight">Self service is temporarily unavailable.</h1><p className="text-muted-foreground">Refresh the page and try again. Your employee records were not changed.</p></main>;
    throw error;
  }
  const [state, themePreference] = await Promise.all([getDashboardState(), getThemePreference()]);
  if (!state.user) redirect("/sign-in?returnTo=%2Fself-service");
  return <AppShell state={state} themePreference={themePreference}>{children}</AppShell>;
}
