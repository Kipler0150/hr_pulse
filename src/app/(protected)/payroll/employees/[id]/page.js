import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { BanknoteIcon, UserRoundPenIcon, UserRoundXIcon } from "lucide-react";
import { deactivateEmployeeAction } from "@/app/actions/payroll";
import { getDb } from "@/db";
import { employees, paySettingDeductions, paySettings, payrollSchedules, organizations } from "@/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPayrollMoney } from "@/payroll/format";
import { getCurrencyExponent } from "@/payroll/currency";
import { requirePayrollAdministrator } from "@/payroll/access";
import { isOvertimeEnabled } from "@/overtime/config";
import { validateUuid } from "@/db/validation";
import { EmployeeForm, PaySettingForm } from "../../components/payroll-forms";

export const metadata = { title: "Employee pay | HR Pulse" };

export default async function PayrollEmployeePage({ params }) {
  const { id } = await params;
  const employeeId = validateUuid(id, "employeeId");
  const context = await requirePayrollAdministrator();
  const database = getDb();
  const [[employee], [source], settings] = await Promise.all([
    database.select().from(employees).where(and(eq(employees.id, employeeId), eq(employees.organizationId, context.organizationId))),
    database.select({ organization: organizations, schedule: payrollSchedules }).from(organizations).innerJoin(payrollSchedules, eq(payrollSchedules.organizationId, organizations.id)).where(eq(organizations.id, context.organizationId)),
    database.select().from(paySettings).where(eq(paySettings.employeeId, employeeId)).orderBy(desc(paySettings.effectiveFrom)),
  ]);
  if (!employee) notFound();
  const deductionRows = settings.length ? await database.select().from(paySettingDeductions).where(eq(paySettingDeductions.paySettingId, settings[0].id)) : [];
  const currencyExponent = getCurrencyExponent(source.organization.defaultCurrency);
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-muted-foreground">{employee.employeeNumber}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{employee.legalName}</h1><p className="mt-3 text-base text-muted-foreground">Maintain identity separately from effective pay history.</p></div><Badge variant={employee.status === "active" ? "success" : "secondary"}>{employee.status}</Badge></header>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card><CardHeader><span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground"><UserRoundPenIcon aria-hidden="true" /></span><CardTitle>Employee profile</CardTitle><CardDescription>Editing current identity does not rewrite confirmed payroll snapshots.</CardDescription></CardHeader><CardContent><EmployeeForm employee={employee} /></CardContent></Card>
        <Card><CardHeader><span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground"><BanknoteIcon aria-hidden="true" /></span><CardTitle>Add effective pay</CardTitle><CardDescription>Pay must cover a whole {source.schedule.frequency} period in {source.organization.defaultCurrency}.</CardDescription></CardHeader><CardContent><PaySettingForm currency={source.organization.defaultCurrency} employeeId={employee.id} expectedVersion={settings[0]?.version ?? 0} frequency={source.schedule.frequency} overtimeEnabled={isOvertimeEnabled()} requestId={randomUUID()} /></CardContent></Card>
      </div>
      <Card>
        <CardHeader><span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground"><UserRoundXIcon aria-hidden="true" /></span><CardTitle>Employment state</CardTitle><CardDescription>{employee.status === "active" ? "Deactivation removes this employee from future payroll previews. Confirmed payroll history and payslips stay unchanged." : "This employee is excluded from future payroll previews. Confirmed payroll history and payslips remain available."}</CardDescription></CardHeader>
        <CardContent>{employee.status === "active" ? <form action={deactivateEmployeeAction}><input name="employeeId" type="hidden" value={employee.id} /><Button type="submit" variant="destructive"><UserRoundXIcon data-icon="inline-start" />Deactivate employee</Button></form> : <Badge variant="secondary">Inactive employee</Badge>}</CardContent>
      </Card>
      <section aria-labelledby="pay-history-title"><h2 className="mb-4 text-xl font-semibold" id="pay-history-title">Pay history</h2><div className="grid gap-4 md:grid-cols-2">{settings.map((setting, index) => <Card key={setting.id} size="sm"><CardHeader><CardTitle as="h3">{setting.effectiveFrom} to {setting.effectiveTo || "ongoing"}</CardTitle><CardDescription>{setting.payFrequency}, version {setting.version}</CardDescription></CardHeader><CardContent><p className="font-mono text-lg font-semibold tabular-nums">{formatPayrollMoney(setting.grossAmountMinor, setting.currency, currencyExponent)}</p><p className="mt-2 text-sm text-muted-foreground">{setting.overtimeEligible ? `Overtime eligible · ${setting.standardPeriodMinutes} standard minutes · ${(setting.overtimeMultiplierBasisPoints / 10000).toFixed(2)}×` : "Not overtime eligible"}</p>{index === 0 && deductionRows.length ? <ul className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground">{deductionRows.map((line) => <li key={line.id}>{line.name}: {formatPayrollMoney(line.amountMinor, setting.currency, currencyExponent)}</li>)}</ul> : null}</CardContent></Card>)}</div></section>
    </div>
  );
}
import { randomUUID } from "node:crypto";
