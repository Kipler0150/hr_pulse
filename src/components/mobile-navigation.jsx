"use client";

import Link from "next/link";
import { ActivityIcon, Building2Icon, CalendarClockIcon, ClipboardCheckIcon, LandmarkIcon, LayoutDashboardIcon, MenuIcon, ShieldCheckIcon, UserRoundIcon } from "lucide-react";

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

export function MobileNavigation({ adminPrivacy = null, attendance = null, organizationName, switchOrganization, footer, operations = null, payroll = false, privacy = null, selfService = null, timecards = null, timeOff = null }) {
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
          {operations ? <Link className={cn(buttonVariants({ size: "comfortable", variant: "ghost" }), "justify-start")} data-slot="navigation-link" href={operations}><ActivityIcon data-icon="inline-start" />Operations</Link> : null}
          {attendance ? (
            <Link className={cn(buttonVariants({ size: "comfortable", variant: "ghost" }), "justify-start")} data-slot="navigation-link" href={attendance}>
              <CalendarClockIcon data-icon="inline-start" />
              Attendance
            </Link>
          ) : null}
          {timecards ? (
            <Link className={cn(buttonVariants({ size: "comfortable", variant: "ghost" }), "justify-start")} data-slot="navigation-link" href={timecards}>
              <ClipboardCheckIcon data-icon="inline-start" />
              Timecards
            </Link>
          ) : null}
          {timeOff ? (
            <Link className={cn(buttonVariants({ size: "comfortable", variant: "ghost" }), "justify-start")} data-slot="navigation-link" href={timeOff}>
              <CalendarClockIcon data-icon="inline-start" />
              Time off
            </Link>
          ) : null}
          {selfService ? <Link className={cn(buttonVariants({ size: "comfortable", variant: "ghost" }), "justify-start")} data-slot="navigation-link" href={selfService}><UserRoundIcon data-icon="inline-start" />My self service</Link> : null}
          {privacy ? <Link className={cn(buttonVariants({ size: "comfortable", variant: "ghost" }), "justify-start")} data-slot="navigation-link" href={privacy}><ShieldCheckIcon data-icon="inline-start" />Privacy</Link> : null}
          {adminPrivacy ? <Link className={cn(buttonVariants({ size: "comfortable", variant: "ghost" }), "justify-start")} data-slot="navigation-link" href={adminPrivacy}><ShieldCheckIcon data-icon="inline-start" />Privacy operations</Link> : null}
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
