import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { ThemeControl } from "@/components/theme-control";
import { getThemePreference } from "@/lib/theme-server";

export async function AuthShell({ children, eyebrow, title, detail }) {
  const themePreference = await getThemePreference();
  return (
    <main className="grid min-h-screen bg-muted/30 lg:grid-cols-[minmax(320px,0.8fr)_minmax(520px,1.2fr)]">
      <aside className="relative hidden overflow-hidden bg-primary p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="relative z-10"><BrandMark inverse /><p className="mt-5 max-w-xs text-sm leading-6 text-primary-foreground/75">The calm operating layer for payroll and attendance.</p></div>
        <div className="relative z-10 max-w-md pb-8"><p className="mb-5 text-sm font-medium uppercase tracking-[0.18em] text-primary-foreground/60">{eyebrow}</p><h2 className="text-4xl font-semibold leading-tight tracking-tight">{title}</h2><p className="mt-5 text-base leading-7 text-primary-foreground/70">{detail}</p></div>
        <div className="absolute -bottom-32 -left-24 size-96 rounded-full border border-primary-foreground/10" aria-hidden="true" /><div className="absolute -right-24 top-24 size-72 rounded-full border border-primary-foreground/10" aria-hidden="true" />
      </aside>
      <div className="relative flex items-center justify-center px-6 py-12 sm:px-12"><ThemeControl className="absolute right-4 top-4 sm:right-6 sm:top-6" preference={themePreference} /><div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 surface-shadow sm:p-8 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">{children}<p className="mt-10 text-center text-xs text-muted-foreground">Protected workspace access for provisioned team members.</p><p className="mt-3 text-center text-xs text-muted-foreground"><Link className="underline underline-offset-4" href="/privacy">Privacy</Link><span aria-hidden="true"> · </span><Link className="underline underline-offset-4" href="/terms">Terms</Link></p></div></div>
    </main>
  );
}
