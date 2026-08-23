"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { validateUuid } from "@/db/validation";
import { getAccessState, safeReturnTo } from "@/auth/access";
import { createClient } from "@/lib/supabase/server";

const genericAuthError = "We could not complete that request. Check your details and try again.";
const resetConfirmation = "If an account matches that email, you will receive a recovery link shortly.";

function logAuthEvent(event) {
  console.info("[auth]", { event, at: new Date().toISOString() });
}

function validEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function signIn(previousState, formData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const returnTo = safeReturnTo(formData.get("returnTo"));
  if (!validEmail(email) || !password) return { error: genericAuthError };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    logAuthEvent("sign_in_failed");
    return { error: genericAuthError };
  }
  logAuthEvent("sign_in_succeeded");

  const state = await getAccessState();
  if (!state.profile || state.profile.status !== "active" || state.memberships.length === 0) {
    redirect("/pending-access");
  }
  if (state.memberships.length > 1) {
    redirect(`/choose-organization?returnTo=${encodeURIComponent(returnTo)}`);
  }
  const cookieStore = await cookies();
  cookieStore.set("hr_pulse_organization_id", state.memberships[0].organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect(returnTo);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  logAuthEvent("sign_out");
  const cookieStore = await cookies();
  cookieStore.delete("hr_pulse_organization_id");
  redirect("/sign-in");
}

export async function requestPasswordReset(previousState, formData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!validEmail(email)) return { error: "Enter a valid email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback?next=/reset-password`,
  });
  if (error) {
    logAuthEvent("password_reset_failed");
    return { error: "We could not send a recovery email right now. Please try again later." };
  }
  logAuthEvent("password_reset_requested");
  return { success: resetConfirmation };
}

export async function updatePassword(previousState, formData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters for your new password." };
  if (password !== confirmPassword) return { error: "Your passwords do not match." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "This recovery link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "This recovery link has expired. Request a new one." };
  logAuthEvent("password_updated");
  redirect("/sign-in?updated=1");
}

export async function chooseOrganization(formData) {
  const organizationId = String(formData.get("organizationId") ?? "");
  const returnTo = safeReturnTo(formData.get("returnTo"));
  try {
    validateUuid(organizationId, "organizationId");
    const state = await getAccessState({ organizationId });
    if (!state.user || !state.profile || state.profile.status !== "active" || !state.selected) {
      return { error: "That organization is not available to your account." };
    }
    const cookieStore = await cookies();
    cookieStore.set("hr_pulse_organization_id", organizationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    redirect(returnTo);
  } catch (error) {
    if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error;
    return { error: "That organization is not available to your account." };
  }
}

export async function getDashboardState() {
  const cookieStore = await cookies();
  const organizationId = cookieStore.get("hr_pulse_organization_id")?.value;
  if (!organizationId) return getAccessState();
  return getAccessState({ organizationId });
}