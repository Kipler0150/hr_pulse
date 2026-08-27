"use client";

import Link from "next/link";
import { Building2Icon, LandmarkIcon, LayoutDashboardIcon, MenuIcon } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function MobileNavigation({ organizationName, switchOrganization, footer, payroll = false }) {
  return (
    <Sheet>
      <SheetTrigger render={<Button aria-label="Open navigation" size="icon-comfortable" variant="ghost" />}>
        <MenuIcon aria-hidden="true" />
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader className="border-b border-border">
          <SheetTitle>HR Pulse navigation</SheetTitle>
          <SheetDescription>{organizationName}</SheetDescription>
        </SheetHeader>
        <nav aria-label="Primary navigation" className="flex flex-1 flex-col gap-2 px-4">
          <Link className={cn(buttonVariants({ size: "comfortable", variant: "secondary" }), "justify-start")} data-slot="navigation-link" href="/dashboard">
            <LayoutDashboardIcon data-icon="inline-start" />
            Dashboard
          </Link>
          {payroll ? (
            <Link className={cn(buttonVariants({ size: "comfortable", variant: "ghost" }), "justify-start")} data-slot="navigation-link" href="/payroll">
              <LandmarkIcon data-icon="inline-start" />
              Payroll
            </Link>
          ) : null}
          {switchOrganization ? (
            <Link className={cn(buttonVariants({ size: "comfortable", variant: "ghost" }), "justify-start")} data-slot="navigation-link" href="/choose-organization">
              <Building2Icon data-icon="inline-start" />
              Switch organization
            </Link>
          ) : null}
        </nav>
        <div className="border-t border-border p-4">{footer}</div>
      </SheetContent>
    </Sheet>
  );
}
