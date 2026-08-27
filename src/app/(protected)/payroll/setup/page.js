import { asc, eq } from "drizzle-orm";
import { KeyRoundIcon, Settings2Icon } from "lucide-react";
import { getDb } from "@/db";
import { memberships, payrollSchedules, profiles } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePayrollAdministrator } from "@/payroll/access";
import { MembershipForm, ScheduleForm } from "../components/payroll-forms";

export const metadata = { title: "Payroll setup | HR Pulse" };

export default async function PayrollSetupPage() {
  const context = await requirePayrollAdministrator();
  const database = getDb();
  const [[schedule], accessRows] = await Promise.all([
    database.select().from(payrollSchedules).where(eq(payrollSchedules.organizationId, context.organizationId)),
    database.select({ membership: memberships, profile: profiles }).from(memberships).innerJoin(profiles, eq(memberships.profileId, profiles.id)).where(eq(memberships.organizationId, context.organizationId)).orderBy(asc(profiles.email)),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <header><p className="text-sm font-medium text-muted-foreground">Payroll setup</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Schedule and administrator access</h1><p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">Keep the operating calendar explicit and provision only the people who need organization access.</p></header>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card><CardHeader><span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground"><Settings2Icon aria-hidden="true" /></span><CardTitle>Payroll schedule</CardTitle><CardDescription>Changes begin on a compatible future boundary. Confirmed runs retain their original schedule snapshot.</CardDescription></CardHeader><CardContent><ScheduleForm key={schedule.version} schedule={schedule} /></CardContent></Card>
        <Card><CardHeader><span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground"><KeyRoundIcon aria-hidden="true" /></span><CardTitle>Assign role access</CardTitle><CardDescription>At least one active administrator must remain at all times.</CardDescription></CardHeader><CardContent><MembershipForm /></CardContent></Card>
      </div>
      <section aria-labelledby="access-title"><div className="mb-4"><h2 className="text-xl font-semibold" id="access-title">Current access</h2><p className="mt-1 text-sm text-muted-foreground">Provisioned profiles in this organization</p></div><div className="grid gap-3 md:grid-cols-2">{accessRows.map(({ membership, profile }) => <Card key={membership.id} size="sm"><CardHeader><CardTitle as="h3">{profile.displayName || profile.email}</CardTitle><CardDescription>{profile.email}</CardDescription></CardHeader><CardContent className="flex gap-2"><Badge variant="outline">{membership.role}</Badge><Badge variant={membership.status === "active" ? "success" : "secondary"}>{membership.status}</Badge></CardContent></Card>)}</div></section>
    </div>
  );
}
