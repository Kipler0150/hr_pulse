"use client";

import { useEffect, useRef, useState } from "react";
import { AuthForm } from "@/app/components/auth-form";
import { getRecoveryError, getRecoverySessionFromHash } from "@/auth/recovery";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/browser";

const expiredRecoveryState = getRecoveryError("otp_expired");

function clearRecoveryCredentials() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.delete("error");
  url.searchParams.delete("error_code");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}

async function resolveRecoveryState(initialState) {
  const recovery = getRecoverySessionFromHash(window.location.hash);
  if (!recovery) return initialState ?? null;

  clearRecoveryCredentials();
  if (recovery.error) return expiredRecoveryState;

  try {
    const supabase = createClient();
    const { error } = await supabase.auth.setSession(recovery.session);
    return error ? expiredRecoveryState : null;
  } catch {
    return expiredRecoveryState;
  }
}

export function RecoveryForm({ action, initialState }) {
  const [formState, setFormState] = useState(undefined);
  const resolution = useRef(null);

  useEffect(() => {
    let active = true;
    resolution.current ??= resolveRecoveryState(initialState);
    resolution.current.then((state) => {
      if (active) setFormState(state);
    });
    return () => {
      active = false;
    };
  }, [initialState]);

  if (formState === undefined) {
    return (
      <p className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground" role="status">
        <Spinner aria-hidden="true" /> Checking recovery link...
      </p>
    );
  }

  return <AuthForm action={action} initialState={formState} mode="reset" />;
}
