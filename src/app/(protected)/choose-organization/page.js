import { redirect } from "next/navigation";
import { getAccessState, safeReturnTo } from "@/auth/access";
import { chooseOrganization } from "@/auth/actions";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Choose organization | HR Pulse" };

export default async function ChooseOrganizationPage({ searchParams }) {
  const state = await getAccessState();
  const params = await searchParams;
  if (!state.user) redirect("/sign-in");
  if (!state.profile || state.profile.status !== "active" || state.memberships.length === 0) redirect("/pending-access");
  if (state.memberships.length === 1) redirect(safeReturnTo(params?.returnTo));
  return <main className="flex min-h-screen items-center justify-center bg-muted/30 px-6 py-16"><section className="w-full max-w-2xl" aria-labelledby="organization-title"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">HR Pulse</p><h1 id="organization-title" className="mt-5 text-3xl font-semibold tracking-tight">Choose your workspace</h1><p className="mt-3 text-muted-foreground">Select the organization you want to work in today.</p><form action={chooseOrganization} className="mt-8 grid gap-3"><input type="hidden" name="returnTo" value={safeReturnTo(params?.returnTo)} />{state.memberships.map((membership) => <label className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-background p-5 transition hover:border-foreground/40 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/40" key={membership.id}><span><span className="block font-medium">{membership.organization.name}</span><span className="mt-1 block text-sm capitalize text-muted-foreground">{membership.role}</span></span><input className="size-5 accent-current" type="radio" name="organizationId" value={membership.organizationId} required /></label>)}<Button className="mt-3 h-11" type="submit">Continue</Button></form></section></main>;
}