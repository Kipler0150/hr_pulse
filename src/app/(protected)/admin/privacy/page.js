import { notFound, redirect } from "next/navigation";

import { getThemePreference } from "@/lib/theme-server";
import { getDb } from "@/db";
import { getPrivacyAccessState, requirePrivacyContext } from "@/privacy/access";
import { listPrivacyRequests } from "@/privacy/requests";
import { AppShell } from "@/components/app-shell";
import { AdminPrivacyControls } from "./admin-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Privacy operations | HR Pulse" };

export default async function AdminPrivacyPage() {
  let accessState;
  try {
    accessState = await getPrivacyAccessState();
  } catch (error) {
    if (error?.code === "PRIVACY_DISABLED") notFound();
    throw error;
  }
  if (!accessState.user) redirect("/sign-in?returnTo=%2Fadmin%2Fprivacy");
  if (!accessState.profile || accessState.profile.status !== "active") redirect("/pending-access");
  if (!accessState.selected) redirect(accessState.memberships.length > 1 ? "/choose-organization?returnTo=%2Fadmin%2Fprivacy" : "/pending-access");
  if (accessState.selected.role !== "administrator") redirect("/dashboard");

  let context;
  try {
    context = await requirePrivacyContext({ administrator: true, state: accessState });
  } catch (error) {
    if (error?.code === "PRIVACY_DISABLED") notFound();
    throw error;
  }
  const [page, themePreference] = await Promise.all([
    listPrivacyRequests({ db: getDb(), organizationId: context.organizationId, admin: true }),
    getThemePreference(),
  ]);
  return <AppShell state={context} themePreference={themePreference}><div className="flex flex-col gap-8"><header className="max-w-3xl"><p className="text-sm font-medium text-muted-foreground">Administrator controls</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Privacy operations</h1><p className="mt-3 text-base leading-7 text-muted-foreground">Review deletion requests and profile-scoped legal holds. Request contents, names, and payroll data are not shown here.</p></header><AdminPrivacyControls requests={page.rows} /></div></AppShell>;
}
