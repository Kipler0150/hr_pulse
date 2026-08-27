import Link from "next/link";
import { Building2Icon, LandmarkIcon, LayoutDashboardIcon, LogOutIcon } from "lucide-react";

import { signOut } from "@/auth/actions";
import { BrandMark } from "@/components/brand-mark";
import { MobileNavigation } from "@/components/mobile-navigation";
import { ThemeControl } from "@/components/theme-control";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatRole } from "@/lib/hr-format";
import { cn } from "@/lib/utils";

function Identity({ name, role, email, inverse = false }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium">{name}</p>
      <p className={inverse ? "truncate text-xs text-sidebar-foreground/75" : "truncate text-xs text-muted-foreground"}>
        {email}
      </p>
      <Badge className="mt-2" variant={inverse ? "secondary" : "outline"}>{formatRole(role)}</Badge>
    </div>
  );
}

function SignOutControl({ comfortable = false }) {
  return (
    <form action={signOut}>
      <Button className="w-full justify-start" size={comfortable ? "comfortable" : "default"} type="submit" variant="ghost">
        <LogOutIcon data-icon="inline-start" />
        Sign out
      </Button>
    </form>
  );
}

export function AppShell({ children, state, themePreference }) {
  const name = state.profile.displayName || state.user.email;
  const organizationName = state.selected.organization.name;
  const canSwitch = state.memberships.length > 1;
  const canManagePayroll = state.selected.role === "administrator";
  const mobileFooter = (
    <div className="flex flex-col gap-4">
      <Identity email={state.user.email} name={name} role={state.selected.role} />
      <SignOutControl comfortable />
    </div>
  );

  return (
    <div className="min-h-screen bg-background md:grid md:grid-cols-[17rem_minmax(0,1fr)]">
      <a className="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground focus:translate-y-0" href="#main-content">
        Skip to main content
      </a>
      <aside className="hidden min-h-screen flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="border-b border-sidebar-border p-6">
          <BrandMark inverse />
        </div>
        <nav aria-label="Primary navigation" className="flex flex-1 flex-col gap-2 p-4">
          <Link className={cn(buttonVariants({ size: "comfortable", variant: "secondary" }), "justify-start")} data-slot="navigation-link" href="/dashboard">
            <LayoutDashboardIcon data-icon="inline-start" />
            Dashboard
          </Link>
          {canManagePayroll ? (
            <Link className={cn(buttonVariants({ size: "comfortable", variant: "ghost" }), "justify-start text-sidebar-foreground")} data-slot="navigation-link" href="/payroll">
              <LandmarkIcon data-icon="inline-start" />
              Payroll
            </Link>
          ) : null}
          {canSwitch ? (
            <Link className={cn(buttonVariants({ size: "comfortable", variant: "ghost" }), "justify-start text-sidebar-foreground")} data-slot="navigation-link" href="/choose-organization">
              <Building2Icon data-icon="inline-start" />
              Switch organization
            </Link>
          ) : null}
        </nav>
        <div className="flex flex-col gap-4 border-t border-sidebar-border p-5">
          <Identity email={state.user.email} inverse name={name} role={state.selected.role} />
          <SignOutControl />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6 xl:px-8">
            <div className="flex min-w-0 items-center gap-2">
              <div className="md:hidden">
                <MobileNavigation footer={mobileFooter} organizationName={organizationName} payroll={canManagePayroll} switchOrganization={canSwitch} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{organizationName}</p>
                <p className="hidden text-xs text-muted-foreground sm:block">Organization workspace</p>
              </div>
            </div>
            <ThemeControl preference={themePreference} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 xl:px-8" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
