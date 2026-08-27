import { redirect } from "next/navigation";
import { Building2Icon } from "lucide-react";

import { AuthShell } from "@/app/components/auth-shell";
import { getAccessState, safeReturnTo } from "@/auth/access";
import { chooseOrganization } from "@/auth/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldLabel, FieldTitle } from "@/components/ui/field";

export const metadata = { title: "Choose organization | HR Pulse" };

export default async function ChooseOrganizationPage({ searchParams }) {
  const state = await getAccessState();
  const params = await searchParams;
  if (!state.user) redirect("/sign-in");
  if (!state.profile || state.profile.status !== "active" || state.memberships.length === 0) redirect("/pending-access");
  if (state.memberships.length === 1) redirect(safeReturnTo(params?.returnTo));

  return (
    <AuthShell detail="Your role and records remain scoped to the organization you select." eyebrow="Organization context" title="Keep each workspace clearly separated.">
      <section aria-labelledby="organization-title">
        <span className="mb-5 flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground"><Building2Icon aria-hidden="true" /></span>
        <h1 className="text-3xl font-semibold tracking-tight" id="organization-title">Choose your workspace</h1>
        <p className="mt-3 text-muted-foreground">Select the organization you want to work in today.</p>
        <form action={chooseOrganization} className="mt-8 flex flex-col gap-3">
          <input name="returnTo" type="hidden" value={safeReturnTo(params?.returnTo)} />
          {state.memberships.map((membership) => (
            <Field key={membership.id}>
              <FieldLabel className="min-h-16 cursor-pointer border-border bg-card p-4 surface-shadow">
                <FieldContent>
                  <FieldTitle>{membership.organization.name}</FieldTitle>
                  <p className="text-sm capitalize text-muted-foreground">{membership.role}</p>
                </FieldContent>
                <input className="size-5 shrink-0 accent-primary" name="organizationId" required type="radio" value={membership.organizationId} />
              </FieldLabel>
            </Field>
          ))}
          <Button className="mt-3" size="comfortable" type="submit">Continue</Button>
        </form>
      </section>
    </AuthShell>
  );
}
