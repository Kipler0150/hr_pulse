"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function RunPolling({ initialStatus, initialDelayed = false, initialRecoveryEligible = false, runId }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [networkWarning, setNetworkWarning] = useState(false);
  const unchanged = useRef(0);
  const observed = useRef({ status: initialStatus, delayed: initialDelayed, recoveryEligible: initialRecoveryEligible });

  useEffect(() => {
    if (!["queued", "processing"].includes(observed.current.status)) return undefined;
    let cancelled = false;
    let timer;
    async function poll() {
      try {
        const response = await fetch(`/api/payroll-runs/${runId}/status`, { cache: "no-store" });
        if (!response.ok) throw new Error("status request failed");
        const next = await response.json();
        if (cancelled) return;
        setNetworkWarning(false);
        const stateChanged = next.status !== observed.current.status
          || Boolean(next.delayed) !== observed.current.delayed
          || Boolean(next.recoveryEligible) !== observed.current.recoveryEligible;
        unchanged.current = next.status === observed.current.status ? unchanged.current + 1 : 0;
        observed.current = { status: next.status, delayed: Boolean(next.delayed), recoveryEligible: Boolean(next.recoveryEligible) };
        setStatus(next.status);
        if (stateChanged || !["queued", "processing"].includes(next.status)) router.refresh();
        if (["queued", "processing"].includes(next.status)) timer = setTimeout(poll, Math.min(10_000, 2_000 + unchanged.current * 1_000));
      } catch {
        if (cancelled) return;
        setNetworkWarning(true);
        unchanged.current += 1;
        timer = setTimeout(poll, Math.min(10_000, 2_000 + unchanged.current * 1_000));
      }
    }
    timer = setTimeout(poll, 2_000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [router, runId]);

  return (
    <div aria-live="polite" className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Current processing state: <span className="font-medium text-foreground">{status}</span></p>
      {networkWarning ? (
        <Alert variant="warning"><AlertTriangleIcon aria-hidden="true" /><AlertTitle>Status connection interrupted</AlertTitle><AlertDescription>Showing the last known state. Automatic checks will continue.</AlertDescription></Alert>
      ) : null}
      <Button onClick={() => router.refresh()} type="button" variant="outline"><RefreshCwIcon data-icon="inline-start" />Refresh status</Button>
    </div>
  );
}
