import { randomUUID } from "node:crypto";
import { AuthForm } from "@/app/components/auth-form";
import { AuthShell } from "@/app/components/auth-shell";
import { signIn } from "@/auth/actions";

export const metadata = { title: "Sign in | HR Pulse" };

export default async function SignInPage({ searchParams }) {
  const params = await searchParams;
  return <AuthShell eyebrow="Your work, in view" title="Run people operations with more clarity." detail="HR Pulse keeps the essential work close at hand, from the first check in to the final payslip."><AuthForm action={signIn} mode="sign-in" requestId={randomUUID()} returnTo={params?.returnTo} /></AuthShell>;
}
