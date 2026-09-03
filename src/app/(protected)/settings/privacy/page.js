import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { FileTextIcon, ShieldCheckIcon } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getThemePreference } from "@/lib/theme-server";
import { getDb } from "@/db";
import { getCurrentProductAnalyticsConsent } from "@/privacy/consent";
import { getPrivacyAccessState, requirePrivacyContext } from "@/privacy/access";
import { listPrivacyRequests } from "@/privacy/requests";
import { PrivacyControls } from "./privacy-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Privacy settings | HR Pulse" };

export default async function PrivacySettingsPage() {
  let accessState;
  try {
    accessState = await getPrivacyAccessState();
  } catch (error) {
    if (error?.code === "PRIVACY_DISABLED") notFound();
    throw error;
  }
  if (!accessState.user) redirect("/sign-in?returnTo=%2Fsettings%2Fprivacy");
  if (!accessState.profile || accessState.profile.status !== "active") redirect("/pending-access");
  if (!accessState.selected) redirect(accessState.memberships.length > 1 ? "/choose-organization?returnTo=%2Fsettings%2Fprivacy" : "/pending-access");

  let context;
  try {
    context = await requirePrivacyContext({ state: accessState });
  } catch (error) {
    if (error?.code === "PRIVACY_DISABLED") notFound();
    throw error;
  }
  const db = getDb();
  const [consent, requestPage, themePreference] = await Promise.all([
    getCurrentProductAnalyticsConsent({ db, organizationId: context.organizationId, profileId: context.profile.id }),
    listPrivacyRequests({ db, organizationId: context.organizationId, profileId: context.profile.id }),
    getThemePreference(),
  ]);
  return <AppShell state={context} themePreference={themePreference}><div className="flex flex-col gap-8">
    <header className="max-w-3xl"><p className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><ShieldCheckIcon aria-hidden="true" className="size-4" /> Privacy controls</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Choose how HR Pulse handles optional data</h1><p className="mt-3 text-base leading-7 text-muted-foreground">Your controls are scoped to this organization and authenticated profile. Product analytics is off until you explicitly opt in.</p></header>
    <Alert variant="information"><FileTextIcon aria-hidden="true" /><AlertTitle>Current policy is version 2026-09-03-v1</AlertTitle><AlertDescription>Read the <Link href="/privacy">privacy notice</Link> and <Link href="/terms">terms of use</Link>. This is an internal, jurisdiction-neutral policy pending legal review.</AlertDescription></Alert>
    <PrivacyControls consent={consent} requests={requestPage.rows} />
  </div></AppShell>;
}
