import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2Icon, Clock3Icon, LogOutIcon } from "lucide-react";

import { AuthShell } from "@/app/components/auth-shell";
import { canFoundOrganization, getAccessState } from "@/auth/access";
import { signOut } from "@/auth/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata = { title: "Access pending | HR Pulse" };

export default async function PendingAccessPage() {
  const state = await getAccessState();
  if (!state.user) redirect("/sign-in");
  if (state.profile?.status === "active" && state.memberships.length) redirect("/dashboard");

  return (
    <AuthShell detail="Your account is secure while an administrator completes the organization connection." eyebrow="Provisioned access" title="A clear path into your workspace.">
      <Card aria-labelledby="pending-title">
        <CardHeader>
          <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-warning/10 text-warning"><Clock3Icon aria-hidden="true" /></span>
          <CardTitle id="pending-title">Your access is being prepared</CardTitle>
          <CardDescription>Your account is valid, but an administrator still needs to connect you to an active organization. You can safely return after that is complete.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <form action={signOut}>
            <Button className="w-full sm:w-auto" size="comfortable" type="submit"><LogOutIcon data-icon="inline-start" />Sign out</Button>
          </form>
          {state.profile?.status === "active" && state.memberships.length === 0 && canFoundOrganization(state.user) ? (
            <Link className={cn(buttonVariants({ size: "comfortable", variant: "outline" }), "w-full sm:w-auto")} href="/setup/organization"><Building2Icon data-icon="inline-start" />Create organization</Link>
          ) : null}
          <Link className={cn(buttonVariants({ size: "comfortable", variant: "outline" }), "w-full sm:w-auto")} href="/sign-in">Return to sign in</Link>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
