import Link from "next/link";
import { notFound } from "next/navigation";

import { PayslipValues } from "@/app/(protected)/self-service/payslips/[id]/payslip-values";
import { PayslipDownload } from "@/app/(protected)/payroll/components/payslip-download";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateRange } from "@/lib/hr-format";
import { cn } from "@/lib/utils";
import { requireSelfServiceContext } from "@/self-service/access";
import { SelfServiceError } from "@/self-service/errors";
import { getPayslip } from "@/self-service/queries";

export const metadata = { title: "Payslip detail | HR Pulse" };
export default async function PayslipDetailPage({ params }) {
  const context = await requireSelfServiceContext();
  const { id } = await params;
  let detail;
  try {
    detail = await getPayslip(context, id);
  } catch (error) { if (error instanceof SelfServiceError && error.code === "SELF_SERVICE_NOT_FOUND") notFound(); throw error; }
  const { record, deductions, earnings } = detail;
  return <div className="flex flex-col gap-8"><header><Link className={cn(buttonVariants({ variant: "ghost" }), "-ml-3")} href="/self-service/payslips">Payslips</Link><p className="mt-4 text-sm font-medium text-muted-foreground">Generated and immutable</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{formatDateRange(record.periodStart, record.periodEnd)}</h1><p className="mt-3 text-base text-muted-foreground">Payroll reference {record.payrollReference}. Amounts stay hidden until you reveal each value.</p></header><div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]"><Card><CardHeader><CardTitle>Pay summary</CardTitle><CardDescription>Private values are masked by default on this page.</CardDescription></CardHeader><CardContent><PayslipValues currency={record.currency} deductions={deductions} deductionsAmountMinor={record.deductionsAmountMinor} earnings={earnings} grossAmountMinor={record.grossAmountMinor} netAmountMinor={record.netAmountMinor} /></CardContent></Card><Card><CardHeader><CardTitle>Document</CardTitle><CardDescription>Secure download links expire after 60 seconds.</CardDescription></CardHeader><CardContent><PayslipDownload label="Download PDF" payslipId={record.id} /></CardContent></Card></div><Card><CardHeader><CardTitle>Payroll identity</CardTitle></CardHeader><CardContent><dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-sm text-muted-foreground">Organization</dt><dd className="font-medium">{record.organizationName}</dd></div><div><dt className="text-sm text-muted-foreground">Employee</dt><dd className="font-medium">{record.legalName} · {record.employeeNumber}</dd></div><div><dt className="text-sm text-muted-foreground">Timezone</dt><dd className="font-medium">{record.organizationTimezone}</dd></div><div><dt className="text-sm text-muted-foreground">Status</dt><dd className="font-medium">Finalized and generated</dd></div></dl></CardContent></Card></div>;
}
