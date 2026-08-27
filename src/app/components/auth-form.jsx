"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRightIcon, CheckCircle2Icon, CircleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

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
    <section aria-labelledby="auth-title" className="w-full max-w-md">
      <div className="mb-8">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">HR Pulse</p>
        <h1 className="text-3xl font-semibold tracking-tight" id="auth-title">{title}</h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">{description}</p>
      </div>
      <form action={formAction} className="flex flex-col gap-5" noValidate>
        <input name="returnTo" type="hidden" value={returnTo} />
        <FieldGroup>
          {!isReset ? <AuthField autoComplete="email" label="Work email" name="email" required type="email" /> : null}
          {isSignIn ? <AuthField autoComplete="current-password" label="Password" name="password" required type="password" /> : null}
          {isReset ? (
            <>
              <AuthField autoComplete="new-password" label="New password" name="password" required type="password" />
              <AuthField autoComplete="new-password" label="Confirm new password" name="confirmPassword" required type="password" />
            </>
          ) : null}
        </FieldGroup>
        {state?.error ? (
          <Alert id="auth-error" variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>We could not complete that request</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}
        {state?.success ? (
          <Alert variant="success">
            <CheckCircle2Icon aria-hidden="true" />
            <AlertTitle>Check your email</AlertTitle>
            <AlertDescription>{state.success}</AlertDescription>
          </Alert>
        ) : null}
        <Button aria-describedby={state?.error ? "auth-error" : undefined} className="w-full" disabled={pending} size="comfortable" type="submit">
          {pending ? <><Spinner data-icon="inline-start" />Working...</> : <>{isSignIn ? "Sign in" : isReset ? "Update password" : "Send recovery link"}<ArrowRightIcon data-icon="inline-end" /></>}
        </Button>
      </form>
      <nav aria-label="Authentication links" className="mt-7 flex flex-wrap items-center justify-between gap-3 text-sm">
        {isSignIn ? <Link className="min-h-11 content-center font-medium underline underline-offset-4" href="/forgot-password">Forgot password?</Link> : isReset ? <Link className="min-h-11 content-center font-medium underline underline-offset-4" href="/forgot-password">Request a new link</Link> : <Link className="min-h-11 content-center font-medium underline underline-offset-4" href="/sign-in">Back to sign in</Link>}
        {!isReset ? <span className="text-muted-foreground">Access is provisioned by your administrator.</span> : null}
      </nav>
    </section>
  );
}

function AuthField({ label, name, ...props }) {
  return (
    <Field>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input className="h-11 px-3 text-base" id={name} name={name} {...props} />
    </Field>
  );
}
