import { notFound } from "next/navigation";
import {
  CalendarDaysIcon,
  CircleAlertIcon,
  CircleCheckBigIcon,
  FileLock2Icon,
  InfoIcon,
  SearchIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { ThemeControl } from "@/components/theme-control";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ResponsiveRecord } from "@/components/ui/responsive-record";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { getStatusPresentation, StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateOnly, formatDateRange, formatInstant, formatMoney } from "@/lib/hr-format";
import { getThemePreference } from "@/lib/theme-server";

export const metadata = { title: "Design system | HR Pulse" };

const statuses = ["pending", "approved", "rejected", "paid", "other"];

export default async function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const preference = await getThemePreference();

  return (
    <main className="min-h-screen bg-background" id="main-content">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 xl:px-8">
          <BrandMark />
          <ThemeControl preference={preference} showLabels />
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl flex-col gap-12 px-4 py-10 sm:px-6 xl:px-8">
        <header className="max-w-3xl">
          <Badge variant="warning">Development only</Badge>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">Design system and interface foundation</h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">A working gallery for the calm operational language used across HR Pulse. Every fixture is fictional and contains no employee or payroll data.</p>
        </header>

        <GallerySection description="The same semantic components rendered against explicit light and dark token scopes." title="Theme foundations">
          <div className="grid gap-4 lg:grid-cols-2">
            <ThemePreview label="Light" theme="light" />
            <ThemePreview label="Dark" theme="dark" />
          </div>
        </GallerySection>

        <GallerySection description="Comfortable actions and form fields for authentication and employee self service." title="Actions and forms">
          <Card>
            <CardHeader>
              <CardTitle>Form states</CardTitle>
              <CardDescription>Persistent labels, linked help, invalid state, pending state, and touch friendly actions.</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid gap-5 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="gallery-email">Work email</FieldLabel>
                  <Input className="h-11" id="gallery-email" placeholder="alex@example.test" type="email" />
                  <FieldDescription>Use the address provisioned by your administrator.</FieldDescription>
                </Field>
                <Field data-invalid>
                  <FieldLabel htmlFor="gallery-code">Employee code</FieldLabel>
                  <Input aria-describedby="gallery-code-error" aria-invalid className="h-11" id="gallery-code" value="EMP ?" readOnly />
                  <FieldError id="gallery-code-error">Use letters and numbers only.</FieldError>
                </Field>
                <Field data-disabled>
                  <FieldLabel htmlFor="gallery-locked">Immutable payroll ID</FieldLabel>
                  <Input className="h-11" disabled id="gallery-locked" value="PAY-2026-008" />
                  <FieldDescription>Final payroll identifiers cannot be edited.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="gallery-search">Search</FieldLabel>
                  <div className="relative">
                    <SearchIcon aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
                    <Input className="h-11 pl-10" id="gallery-search" placeholder="Search employees" />
                  </div>
                </Field>
              </FieldGroup>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button size="comfortable">Primary action</Button>
                <Button size="comfortable" variant="outline">Secondary action</Button>
                <Button disabled size="comfortable">Disabled action</Button>
                <Button disabled size="comfortable"><span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />Saving...</Button>
                <Button size="comfortable" variant="destructive">Delete draft</Button>
              </div>
            </CardContent>
          </Card>
        </GallerySection>

        <GallerySection description="Messages pair color with explicit language and an icon." title="Feedback and status">
          <div className="grid gap-4 lg:grid-cols-2">
            <Alert variant="information"><InfoIcon aria-hidden="true" /><AlertTitle>Information</AlertTitle><AlertDescription>Payroll values use the organization currency.</AlertDescription></Alert>
            <Alert variant="success"><CircleCheckBigIcon aria-hidden="true" /><AlertTitle>Approved</AlertTitle><AlertDescription>The timecard is ready for payroll.</AlertDescription></Alert>
            <Alert variant="warning"><TriangleAlertIcon aria-hidden="true" /><AlertTitle>Needs attention</AlertTitle><AlertDescription>One attendance interval is incomplete.</AlertDescription></Alert>
            <Alert variant="destructive"><CircleAlertIcon aria-hidden="true" /><AlertTitle>Could not save</AlertTitle><AlertDescription>Review the highlighted values and try again.</AlertDescription></Alert>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {statuses.map((status) => <StatusBadge key={status} {...getStatusPresentation(status)} />)}
          </div>
        </GallerySection>

        <GallerySection description="Priority values stay visible at narrow widths. Secondary details use native disclosure." title="Responsive records">
          <ResponsiveRecord
            action={<Button size="comfortable" variant="outline">Review</Button>}
            priorityValues={[{ label: "Employee", value: "Sample employee" }, { label: "Net pay", value: formatMoney(4267350, "PHP") }]}
            secondaryValues={[{ label: "Pay date", value: formatDateOnly("2026-08-31") }, { label: "Status", value: "Pending review" }, { label: "Period", value: formatDateRange("2026-08-16", "2026-08-31") }, { label: "Timezone", value: "Asia/Manila" }]}
            title="August payroll preview"
          />
          <Card className="mt-4">
            <CardHeader><CardTitle>Compact table contract</CardTitle><CardDescription>Administrative tables keep their key action and priority columns visible.</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Net pay</TableHead></TableRow></TableHeader>
                <TableBody>
                  <TableRow><TableCell>Sample employee</TableCell><TableCell><StatusBadge {...getStatusPresentation("approved")} /></TableCell><TableCell className="text-right font-mono tabular-nums">{formatMoney(4267350, "PHP")}</TableCell></TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </GallerySection>

        <GallerySection description="Organization timezone and currency remain explicit. Sensitive values deny reveal unless authorization is supplied." title="HR value patterns">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ValueCard label="Currency" value={formatMoney(985075, "PHP")} />
            <ValueCard label="Local instant" value={formatInstant("2026-08-25T01:15:00Z", "Asia/Manila")} />
            <ValueCard label="Leave range" value={formatDateRange("2026-09-01", "2026-09-03")} />
            <Card><CardHeader><CardDescription>Bank account</CardDescription><CardTitle as="h3"><SensitiveValue canReveal value="•• 4812" /></CardTitle></CardHeader></Card>
          </div>
        </GallerySection>

        <GallerySection description="Representative loading, empty, retry, and destructive confirmation treatments." title="System states">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card aria-busy="true"><CardHeader><Skeleton className="h-5 w-28" /><Skeleton className="h-4 w-44" /></CardHeader><CardContent><Skeleton className="h-24" /></CardContent></Card>
            <Card><CardContent><Empty><EmptyHeader><EmptyMedia variant="icon"><CalendarDaysIcon aria-hidden="true" /></EmptyMedia><EmptyTitle>No attendance records</EmptyTitle><EmptyDescription>Check ins will appear here after the attendance slice is active.</EmptyDescription></EmptyHeader></Empty></CardContent></Card>
            <Card><CardHeader><span className="flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive"><ShieldAlertIcon aria-hidden="true" /></span><CardTitle as="h3">Delete payroll draft?</CardTitle><CardDescription>This action removes the editable draft. Final payroll records remain immutable.</CardDescription></CardHeader><CardFooter className="justify-end gap-2"><Button variant="outline">Cancel</Button><Button variant="destructive">Delete draft</Button></CardFooter></Card>
          </div>
        </GallerySection>

        <GallerySection description="The modal sheet supplies focus management, Escape handling, and focus restoration for mobile navigation." title="Overlay and disclosure">
          <Sheet>
            <SheetTrigger render={<Button size="comfortable" variant="outline" />}>Open detail sheet</SheetTrigger>
            <SheetContent>
              <SheetHeader><SheetTitle>Attendance detail</SheetTitle><SheetDescription>Fictional values for the accessible overlay pattern.</SheetDescription></SheetHeader>
              <div className="px-4"><ResponsiveRecord priorityValues={[{ label: "Date", value: "25 Aug 2026" }, { label: "Hours", value: "8.0" }]} secondaryValues={[{ label: "Check in", value: "8:58 AM" }, { label: "Check out", value: "5:02 PM" }]} title="Sample workday" /></div>
            </SheetContent>
          </Sheet>
        </GallerySection>

        <GallerySection description="No chart library is selected. Tokens, labels, legend, and a text summary define the future contract." title="Data visualization guidance">
          <Card>
            <CardHeader><CardTitle>Payroll cost trend</CardTitle><CardDescription>Illustrative token bars only. Total payroll is steady across four fictional periods.</CardDescription></CardHeader>
            <CardContent>
              <figure>
                <div aria-hidden="true" className="flex h-40 items-end gap-4 rounded-xl bg-muted/40 p-4">
                  {[55, 68, 61, 76].map((height, index) => <div className="flex flex-1 flex-col justify-end gap-2" key={height}><div className={index === 3 ? "rounded-t-md bg-chart-2" : "rounded-t-md bg-chart-1"} style={{ height: `${height}%` }} /><span className="text-center text-xs text-muted-foreground">P{index + 1}</span></div>)}
                </div>
                <figcaption className="mt-4 text-sm text-muted-foreground">Text summary: fictional payroll cost rises modestly from period 1 to period 4, with a small dip in period 3.</figcaption>
              </figure>
              <div className="mt-4 flex flex-wrap gap-4 text-sm"><span className="flex items-center gap-2"><span className="size-3 rounded-sm bg-chart-1" aria-hidden="true" />Regular periods</span><span className="flex items-center gap-2"><span className="size-3 rounded-sm bg-chart-2" aria-hidden="true" />Selected period</span></div>
            </CardContent>
          </Card>
        </GallerySection>
      </div>
    </main>
  );
}

function GallerySection({ title, description, children }) {
  const id = `gallery-${title.toLowerCase().replaceAll(" ", "-")}`;
  return <section aria-labelledby={id}><div className="mb-5"><h2 className="text-2xl font-semibold tracking-tight" id={id}>{title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p></div>{children}</section>;
}

function ThemePreview({ label, theme }) {
  return (
    <div className={`${theme} rounded-2xl border border-border bg-background p-5 text-foreground`}>
      <p className="text-sm font-semibold">{label} theme</p>
      <div className="mt-4 grid grid-cols-5 gap-2" aria-label={`${label} color roles`} role="img">
        {["bg-primary", "bg-accent", "bg-success", "bg-warning", "bg-destructive"].map((token) => <span className={`${token} h-12 rounded-lg border border-border`} key={token} />)}
      </div>
      <Card className="mt-4"><CardHeader><CardTitle as="h3">Operational surface</CardTitle><CardDescription>Ink, body, muted text, border, and focus tokens remain readable.</CardDescription></CardHeader><CardContent><Button size="comfortable">Review payroll</Button></CardContent></Card>
    </div>
  );
}

function ValueCard({ label, value }) {
  return <Card><CardHeader><CardDescription>{label}</CardDescription><CardTitle as="h3" className="text-lg tabular-nums">{value}</CardTitle></CardHeader></Card>;
}
