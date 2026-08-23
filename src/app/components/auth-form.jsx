"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AuthForm({ action, mode, returnTo = "/dashboard", initialState = null }) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const isSignIn = mode === "sign-in";
  const isReset = mode === "reset";
  const title = isSignIn ? "Welcome back" : isReset ? "Set a new password" : "Recover your access";
  const description = isSignIn
    ? "Sign in to your private HR workspace."
    : isReset
      ? "Choose a new password for your HR Pulse account."
      : "Enter your work email and we will send a secure recovery link.";

  return (
    <section className="w-full max-w-md" aria-labelledby="auth-title">
      <div className="mb-8">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">HR Pulse</p>
        <h1 id="auth-title" className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">{description}</p>
      </div>
      <form action={formAction} className="space-y-5" noValidate>
        <input type="hidden" name="returnTo" value={returnTo} />
        {!isReset && <Field label="Work email" name="email" type="email" autoComplete="email" required />}
        {isSignIn && <Field label="Password" name="password" type="password" autoComplete="current-password" required />}
        {isReset && <>
          <Field label="New password" name="password" type="password" autoComplete="new-password" required />
          <Field label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" required />
        </>}
        {state?.error && <p id="auth-error" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{state.error}</p>}
        {state?.success && <p className="flex gap-2 rounded-lg border border-border bg-muted px-4 py-3 text-sm" role="status"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{state.success}</p>}
        <Button className="h-11 w-full text-base" size="lg" type="submit" disabled={pending} aria-describedby={state?.error ? "auth-error" : undefined}>
          {pending ? <><LoaderCircle className="animate-spin" aria-hidden="true" />Working...</> : <>{isSignIn ? "Sign in" : isReset ? "Update password" : "Send recovery link"}<ArrowRight aria-hidden="true" /></>}
        </Button>
      </form>
      <nav className="mt-7 flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Authentication links">
        {isSignIn ? <Link className="font-medium underline underline-offset-4" href="/forgot-password">Forgot password?</Link> : isReset ? <Link className="font-medium underline underline-offset-4" href="/forgot-password">Request a new link</Link> : <Link className="font-medium underline underline-offset-4" href="/sign-in">Back to sign in</Link>}
        {!isReset && <span className="text-muted-foreground">Access is provisioned by your administrator.</span>}
      </nav>
    </section>
  );
}

function Field({ label, name, ...props }) {
  return <div className="space-y-2"><label className="text-sm font-medium" htmlFor={name}>{label}</label><input className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40" id={name} name={name} {...props} /></div>;
}