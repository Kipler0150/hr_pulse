import Link from "next/link";
import { ContactRoundIcon, FileClockIcon, ReceiptTextIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateRange } from "@/lib/hr-format";
import { requireSelfServiceContext } from "@/self-service/access";
import { SelfServiceError } from "@/self-service/errors";
import { getSelfServiceHome } from "@/self-service/queries";

export const dynamic = "force-dynamic";
import { cn } from "@/lib/utils";

export const metadata = { title: "My self service | HR Pulse" };

export default async function SelfServiceHomePage() {
  let context;
  try { context = await requireSelfServiceContext(); }
  catch (error) {
    if (error instanceof SelfServiceError && error.code === "SELF_SERVICE_UNAVAILABLE") return <main role="alert" className="mx-auto flex min-h-64 max-w-2xl flex-col justify-center gap-4 px-4"><h1 className="text-3xl font-semibold tracking-tight">Self service is temporarily unavailable.</h1><p className="text-muted-foreground">Refresh the page and try again. Your employee records were not changed.</p></main>;
    throw error;
  }
  const home = await getSelfServiceHome(context);
  const cards = [
    { icon: ContactRoundIcon, title: "Your profile", description: home.profileComplete ? "Your preferred name and phone are complete." : "Add your preferred name and phone to complete your profile.", href: "/self-service/profile", action: home.profileComplete ? "Review profile" : "Complete profile" },
    { icon: FileClockIcon, title: "Approved time", description: home.latestTimecard ? `Latest approved period: ${formatDateRange(home.latestTimecard.periodStart, home.latestTimecard.periodEnd)}.` : "No approved timecards are available yet.", error: home.timecardError, href: "/self-service/time", action: "View approved time" },
    { icon: ReceiptTextIcon, title: "Payslips", description: home.latestPayslip ? `Latest generated period: ${formatDateRange(home.latestPayslip.periodStart, home.latestPayslip.periodEnd)}.` : "No generated payslips are available yet.", error: home.payslipError, href: "/self-service/payslips", action: "View payslips" },
  ];
  return <div className="flex flex-col gap-8"><header><p className="text-sm font-medium text-muted-foreground">Employee self service</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Your work records, in one place</h1><p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">Keep your contact details current and review the approved time and payslip evidence available to you.</p></header><section aria-label="Self service sections" className="grid gap-5 lg:grid-cols-3">{cards.map(({ icon: Icon, error, ...card }) => <Card key={card.href}><CardHeader><Icon aria-hidden="true" className="size-9 text-primary" /><CardTitle>{card.title}</CardTitle><CardDescription>{card.description}</CardDescription>{error ? <Alert className="mt-4" variant="destructive"><AlertTitle>Section temporarily unavailable</AlertTitle><AlertDescription>Refresh this section and try again.</AlertDescription></Alert> : null}</CardHeader><CardContent><Link className={cn(buttonVariants({ variant: "outline" }), "w-full")} href={card.href}>{card.action}</Link></CardContent></Card>)}</section></div>;
}
