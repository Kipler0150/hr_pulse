import Link from "next/link";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { UserRoundPlusIcon, UsersRoundIcon } from "lucide-react";
import { getDb } from "@/db";
import { employees } from "@/db/schema";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ResponsiveRecord } from "@/components/ui/responsive-record";
import { cn } from "@/lib/utils";
import { requirePayrollAdministrator } from "@/payroll/access";
import { decodeTimestampCursor, encodeTimestampCursor, PAYROLL_PAGE_SIZE } from "@/payroll/pagination";
import { EmployeeForm } from "../components/payroll-forms";

export const metadata = { title: "Payroll employees | HR Pulse" };

export default async function PayrollEmployeesPage({ searchParams }) {
  const { cursor: cursorValue } = await searchParams;
  const context = await requirePayrollAdministrator();
  const cursor = decodeTimestampCursor(cursorValue);
  const createdAtMilliseconds = sql`floor(extract(epoch from ${employees.createdAt}) * 1000)`;
  const cursorFilter = cursor
    ? or(lt(createdAtMilliseconds, cursor.createdAtMilliseconds), and(eq(createdAtMilliseconds, cursor.createdAtMilliseconds), lt(employees.id, cursor.id)))
    : undefined;
  const rows = await getDb().select().from(employees).where(and(eq(employees.organizationId, context.organizationId), cursorFilter)).orderBy(desc(createdAtMilliseconds), desc(employees.id)).limit(PAYROLL_PAGE_SIZE + 1);
  const visibleRows = rows.slice(0, PAYROLL_PAGE_SIZE);
  const boundary = visibleRows.at(-1);
  const nextCursor = rows.length > PAYROLL_PAGE_SIZE && boundary ? encodeTimestampCursor(boundary.createdAt, boundary.id) : null;
  return (
    <div className="flex flex-col gap-8">
      <header><p className="text-sm font-medium text-muted-foreground">Employee pay records</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">People included in payroll</h1><p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">Employee identity, active state, hire date, and full period pay coverage decide who enters the next preview.</p></header>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-labelledby="employee-list-title"><h2 className="mb-4 text-xl font-semibold" id="employee-list-title">Employee records</h2>{visibleRows.length === 0 ? <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><UsersRoundIcon /></EmptyMedia><EmptyTitle>No employees yet</EmptyTitle><EmptyDescription>Add one synthetic employee to prepare the first payroll preview.</EmptyDescription></EmptyHeader><EmptyContent><span className="text-sm text-muted-foreground">Use the form beside this list.</span></EmptyContent></Empty> : <div className="flex flex-col gap-3">{visibleRows.map((employee) => <ResponsiveRecord action={<Link className={cn(buttonVariants({ variant: "outline" }))} href={`/payroll/employees/${employee.id}`}>Manage pay</Link>} key={employee.id} priorityValues={[{ label: "Employee number", value: employee.employeeNumber }, { label: "Status", value: employee.status }]} secondaryValues={[{ label: "Hire date", value: employee.hireDate }, { label: "Department", value: employee.department || "Not set" }]} title={employee.preferredName || employee.legalName} />)}{nextCursor ? <Link className={cn(buttonVariants({ variant: "outline" }), "self-start")} href={`/payroll/employees?cursor=${encodeURIComponent(nextCursor)}`}>More employees</Link> : null}</div>}</section>
        <Card><CardHeader><span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground"><UserRoundPlusIcon aria-hidden="true" /></span><CardTitle>Add employee</CardTitle><CardDescription>Use synthetic identity and pay data during the beta.</CardDescription></CardHeader><CardContent><EmployeeForm /></CardContent></Card>
      </div>
    </div>
  );
}
