import { redirect } from "next/navigation";
import { CalendarClockIcon, CircleCheckBigIcon, LandmarkIcon, UsersRoundIcon } from "lucide-react";

import { getDashboardState } from "@/auth/actions";
import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRole } from "@/lib/hr-format";
import { getThemePreference } from "@/lib/theme-server";

export const metadata = { title: "Dashboard | HR Pulse" };

export default async function DashboardPage() {
  const [state, themePreference] = await Promise.all([getDashboardState(), getThemePreference()]);
  if (!state.user) redirect("/sign-in?returnTo=%2Fdashboard");
  if (!state.profile || state.profile.status !== "active" || state.memberships.length === 0) redirect("/pending-access");
  if (!state.selected) redirect("/choose-organization?returnTo=%2Fdashboard");

  const name = state.profile.displayName || state.user.email;

  return (
    <AppShell state={state} themePreference={themePreference}>
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Good to see you, {name}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Your work, in view</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">A focused overview of your organization context and the operational foundations ready for the next HR workflow.</p>
          </div>
          <Badge className="h-7" variant="success"><CircleCheckBigIcon data-icon="inline-start" />Workspace active</Badge>
        </header>

        <Alert variant="information">
          <CircleCheckBigIcon aria-hidden="true" />
          <AlertTitle>Foundation ready</AlertTitle>
          <AlertDescription>Authentication and organization access are active. Payroll and attendance records will appear as their product slices are implemented.</AlertDescription>
        </Alert>

        <section aria-labelledby="overview-title">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold" id="overview-title">Workspace overview</h2>
              <p className="mt-1 text-sm text-muted-foreground">Current access and product readiness</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <OverviewCard description={`Your access is scoped to ${state.selected.organization.name}.`} Icon={UsersRoundIcon} label="Workspace role" value={formatRole(state.selected.role)} />
            <OverviewCard description="Payroll runs and payslips will appear here after the payroll slice lands." Icon={LandmarkIcon} label="Payroll" value="Ready for the next slice" />
            <OverviewCard description="Work time and attendance records will appear after attendance is implemented." Icon={CalendarClockIcon} label="Attendance" value="A clear day ahead" />
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>What comes next</CardTitle>
            <CardDescription>The dashboard shows only working destinations. New modules will join navigation after their complete slices are available.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-3 sm:grid-cols-3">
              {[
                ["01", "Payroll thread", "Add an employee, calculate a basic run, and produce a payslip."],
                ["02", "Attendance", "Record check ins and clock outs with organization local time."],
                ["03", "Manager review", "Approve time and leave without losing mobile context."],
              ].map(([number, title, detail]) => (
                <li className="rounded-xl border border-border bg-muted/40 p-4" key={number}>
                  <span className="font-mono text-xs font-semibold text-accent-foreground">{number}</span>
                  <h3 className="mt-3 font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function OverviewCard({ description, Icon, label, value }) {
  return (
    <Card>
      <CardHeader>
        <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground"><Icon aria-hidden="true" /></span>
        <CardDescription>{label}</CardDescription>
        <CardTitle as="h3" className="text-xl">{value}</CardTitle>
      </CardHeader>
      <CardContent><p className="text-sm leading-6 text-muted-foreground">{description}</p></CardContent>
    </Card>
  );
}
