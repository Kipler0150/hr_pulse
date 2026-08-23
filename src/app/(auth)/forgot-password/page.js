import { AuthForm } from "@/app/components/auth-form";
import { AuthShell } from "@/app/components/auth-shell";
import { requestPasswordReset } from "@/auth/actions";

export const metadata = { title: "Recover access | HR Pulse" };

export default function ForgotPasswordPage() {
  return <AuthShell eyebrow="A clear way back in" title="Access should be recoverable." detail="We will send a time limited link to the email you use for HR Pulse. Your workspace remains private throughout."><AuthForm action={requestPasswordReset} mode="forgot" /></AuthShell>;
}