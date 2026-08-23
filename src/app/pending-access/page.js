import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccessState } from "@/auth/access";
import { signOut } from "@/auth/actions";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Access pending | HR Pulse" };

export default async function PendingAccessPage() {
  const state = await getAccessState();
  if (!state.user) redirect("/sign-in");
  if (state.profile?.status === "active" && state.memberships.length) redirect("/dashboard");
  return <main className="flex min-h-screen items-center justify-center bg-muted/30 px-6 py-16"><section className="w-full max-w-xl rounded-xl border border-border bg-background p-8 shadow-sm sm:p-12" aria-labelledby="pending-title"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">HR Pulse</p><h1 id="pending-title" className="mt-8 text-3xl font-semibold tracking-tight">Your access is being prepared.</h1><p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">Your account is valid, but an administrator still needs to connect you to an active organization. You can safely close this page and return after that is complete.</p><div className="mt-8 flex flex-wrap gap-3"><form action={signOut}><Button type="submit">Sign out</Button></form><Button asChild variant="outline"><Link href="/sign-in">Return to sign in</Link></Button></div></section></main>;
}