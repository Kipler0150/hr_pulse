import Link from "next/link";
import { ReceiptTextIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ResponsiveRecord } from "@/components/ui/responsive-record";
import { formatDateRange } from "@/lib/hr-format";
import { cn } from "@/lib/utils";
import { requireSelfServiceContext } from "@/self-service/access";
import { SelfServiceError } from "@/self-service/errors";
import { listPayslips } from "@/self-service/queries";

export const metadata = { title: "Payslips | HR Pulse" };
export default async function SelfServicePayslipsPage({ searchParams }) {
  const context = await requireSelfServiceContext(); const params = await searchParams;
  let page;
  try { page = await listPayslips(context, params?.cursor); }
  catch (error) {
    if (error instanceof SelfServiceError && error.code === "SELF_SERVICE_INVALID_CURSOR") {
      return <div className="flex flex-col gap-6"><h1 className="text-3xl font-semibold tracking-tight">Your finalized pay documents</h1><div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4"><p className="font-medium">This page link is invalid.</p><p className="mt-1 text-sm text-muted-foreground">Return to the first page and try again.</p><Link className={cn(buttonVariants({ variant: "outline" }), "mt-4")} href="/self-service/payslips">First page</Link></div></div>;
    }
    throw error;
  }
  return <div className="flex flex-col gap-8"><header><Link className={cn(buttonVariants({ variant: "ghost" }), "-ml-3")} href="/self-service">Self service</Link><p className="mt-4 text-sm font-medium text-muted-foreground">Payslips</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Your finalized pay documents</h1><p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">Only generated, immutable documents from completed payroll are listed here.</p></header><Card><CardHeader><CardTitle>Payslip history</CardTitle><CardDescription>Newest generated payroll period first.</CardDescription></CardHeader><CardContent>{page.rows.length ? <div className="flex flex-col gap-3">{page.rows.map((row) => <ResponsiveRecord action={<Link className={buttonVariants({ variant: "outline" })} href={`/self-service/payslips/${row.id}`}>View payslip</Link>} key={row.id} priorityValues={[{ label: "Pay period", value: formatDateRange(row.periodStart, row.periodEnd) }, { label: "Document", value: "Generated" }]} secondaryValues={[{ label: "Generated", value: row.generatedAt ? new Date(row.generatedAt).toLocaleDateString("en-PH") : "Available" }]} title="Finalized payslip" />)}{page.nextCursor ? <Link className={cn(buttonVariants({ variant: "outline" }), "self-start")} href={`/self-service/payslips?cursor=${encodeURIComponent(page.nextCursor)}`}>Older payslips</Link> : null}</div> : <Empty><EmptyHeader><EmptyMedia variant="icon"><ReceiptTextIcon aria-hidden="true" /></EmptyMedia><EmptyTitle>No generated payslips</EmptyTitle><EmptyDescription>Your finalized pay documents will appear here when they are ready.</EmptyDescription></EmptyHeader></Empty>}</CardContent></Card></div>;
}
