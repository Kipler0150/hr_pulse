import { EyeIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePayrollAdministrator } from "@/payroll/access";
import { getPayrollReleaseState } from "@/payroll/config";
import { PayrollPreview } from "../components/payroll-forms";

export const metadata = { title: "Preview payroll | HR Pulse" };

export default async function PayrollPreviewPage() {
  await requirePayrollAdministrator();
  const release = getPayrollReleaseState();
  return (
    <div className="flex flex-col gap-8">
      <header><p className="text-sm font-medium text-muted-foreground">Next closed period</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Review before payroll is frozen</h1><p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">HR Pulse derives the period from the schedule, checks every eligible employee, and returns all blockers together.</p></header>
      {!release.enabled ? <Alert variant="warning"><AlertTitle>Payroll is disabled</AlertTitle><AlertDescription>The server feature switch must be enabled before preview can run.</AlertDescription></Alert> : null}
      <Card><CardHeader><span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground"><EyeIcon aria-hidden="true" /></span><CardTitle>Payroll preview</CardTitle><CardDescription>No financial record is created until you confirm a blocker free preview.</CardDescription></CardHeader><CardContent><PayrollPreview /></CardContent></Card>
    </div>
  );
}
