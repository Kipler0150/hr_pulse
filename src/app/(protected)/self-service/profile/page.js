import Link from "next/link";
import { ArrowLeftIcon, UserRoundIcon } from "lucide-react";

import { SelfServiceProfileForm } from "@/app/(protected)/self-service/components/profile-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateOnly } from "@/lib/hr-format";
import { cn } from "@/lib/utils";
import { requireSelfServiceContext } from "@/self-service/access";
import { getSelfServiceProfile } from "@/self-service/queries";

export const metadata = { title: "My profile | HR Pulse" };

export default async function SelfServiceProfilePage() {
  const context = await requireSelfServiceContext(); const { employee, managerName } = await getSelfServiceProfile(context);
  const fields = [["Legal name", employee.legalName], ["Employee number", employee.employeeNumber], ["Work email", employee.email], ["Department", employee.department || "Not set"], ["Job title", employee.title || "Not set"], ["Manager", managerName], ["Work location", employee.workLocation || "Not set"], ["Hire date", formatDateOnly(employee.hireDate)]];
  return <div className="flex flex-col gap-8"><header><Link className={cn(buttonVariants({ variant: "ghost" }), "-ml-3")} href="/self-service"><ArrowLeftIcon data-icon="inline-start" />Self service</Link><p className="mt-4 text-sm font-medium text-muted-foreground">Personal profile</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Keep your contact details current</h1></header><div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,.75fr)]"><Card><CardHeader><UserRoundIcon aria-hidden="true" className="size-9 text-primary" /><CardTitle>Your contact details</CardTitle><CardDescription>Only your preferred name and phone can be edited here. Blank fields are cleared.</CardDescription></CardHeader><CardContent><SelfServiceProfileForm employee={employee} /></CardContent></Card><Card><CardHeader><CardTitle>Employment details</CardTitle><CardDescription>Ask your administrator if any read only employment detail needs correction.</CardDescription></CardHeader><CardContent><dl className="grid gap-4 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label}><dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl></CardContent></Card></div></div>;
}
