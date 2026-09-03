import { notFound, redirect } from "next/navigation";
import { getDashboardState } from "@/auth/actions";
import { AppShell } from "@/components/app-shell";
import { getThemePreference } from "@/lib/theme-server";
import { requireProductOperationsContext } from "@/product-operations/access";

export const dynamic = "force-dynamic";

export default async function OperationsLayout({ children }) {
  try {
    await requireProductOperationsContext();
  } catch (error) {
    if (error?.code === "PRODUCT_OPERATIONS_DISABLED") notFound();
    if (error?.code === "PRODUCT_OPERATIONS_FORBIDDEN") redirect("/dashboard");
    throw error;
  }
  const [state, themePreference] = await Promise.all([getDashboardState(), getThemePreference()]);
  return <AppShell state={state} themePreference={themePreference}>{children}</AppShell>;
}
