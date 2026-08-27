import { redirect } from "next/navigation";
import { Building2Icon } from "lucide-react";
import { AuthShell } from "@/app/components/auth-shell";
import { OrganizationSetupForm } from "@/app/components/organization-setup-form";
import { getAccessState } from "@/auth/access";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Create organization | HR Pulse" };

export default async function OrganizationSetupPage() {
  const state = await getAccessState();
  if (!state.user) redirect("/sign-in?returnTo=%2Fsetup%2Forganization");
  if (!state.profile || state.profile.status !== "active") redirect("/pending-access");
  if (state.memberships.length > 0) redirect("/dashboard");
  return (
    <AuthShell detail="Set the operating calendar once, then add your first employee and review a closed payroll period." eyebrow="Founding administrator" title="Create your payroll workspace.">
      <Card>
        <CardHeader>
          <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground"><Building2Icon aria-hidden="true" /></span>
          <CardTitle>Organization and payroll schedule</CardTitle>
          <CardDescription>You become the founding administrator. Payroll remains limited to synthetic beta data.</CardDescription>
        </CardHeader>
        <CardContent><OrganizationSetupForm /></CardContent>
      </Card>
    </AuthShell>
  );
}
