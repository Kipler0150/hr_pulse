import { AuthShell } from "@/app/components/auth-shell";
import { RecoveryForm } from "@/app/components/recovery-form";
import { updatePassword } from "@/auth/actions";
import { getRecoveryError } from "@/auth/recovery";

export const metadata = { title: "Set password | HR Pulse" };

export default async function ResetPasswordPage({ searchParams }) {
  const params = await searchParams;
  const initialState = getRecoveryError(params?.error_code);
  return <AuthShell eyebrow="Almost there" title="Choose a password you will remember." detail="Use at least eight characters. After you update it, you can sign in again with your new password."><RecoveryForm action={updatePassword} initialState={initialState} /></AuthShell>;
}
