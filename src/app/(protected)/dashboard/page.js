import { redirect } from "next/navigation";
import { getDashboardState } from "@/auth/actions";
import { signOut } from "@/auth/actions";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Dashboard | HR Pulse" };

export default async function DashboardPage() {
  const state = await getDashboardState();
  if (!state.user) redirect("/sign-in?returnTo=%2Fdashboard");
  if (!state.profile || state.profile.status !== "active" || state.memberships.length === 0) redirect("/pending-access");
  if (!state.selected) redirect("/choose-organization?returnTo=%2Fdashboard");
  const name = state.profile.displayName || state.user.email;
  return <main className="min-h-screen bg-muted/30"><header className="border-b border-border bg-background"><div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">HR Pulse</p><p className="mt-1 text-sm text-muted-foreground">{state.selected.organization.name}</p></div><form action={signOut}><Button type="submit" variant="outline">Sign out</Button></form></div></header><section className="mx-auto max-w-6xl px-6 py-12"><p className="text-sm font-medium text-muted-foreground">Good to see you, {name}</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Your work, in view.</h1><div className="mt-10 grid gap-5 md:grid-cols-3"><article className="rounded-xl border border-border bg-background p-6"><p className="text-sm text-muted-foreground">Workspace role</p><p className="mt-3 text-2xl font-semibold capitalize">{state.selected.role}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Your access is scoped to {state.selected.organization.name}.</p></article><article className="rounded-xl border border-border bg-background p-6"><p className="text-sm text-muted-foreground">Payroll</p><p className="mt-3 text-2xl font-semibold">Ready when you are</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Payroll runs and payslips will appear here.</p></article><article className="rounded-xl border border-border bg-background p-6"><p className="text-sm text-muted-foreground">Attendance</p><p className="mt-3 text-2xl font-semibold">A clear day ahead</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Work time records will appear here.</p></article></div></section></main>;
}