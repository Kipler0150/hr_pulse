"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MASK = "••••••";

export function SensitiveValue({ value, canReveal = false, className }) {
  const [revealed, setRevealed] = useState(false);
  const statusId = useId();
  const visibleValue = canReveal && revealed ? value : MASK;

  return (
    <span className={cn("inline-flex min-h-11 items-center gap-2", className)} data-slot="sensitive-value">
      <span aria-hidden="true" className="font-mono tabular-nums">{visibleValue}</span>
      <span className="sr-only" id={statusId} aria-live="polite">
        {canReveal && revealed ? value : "Sensitive value hidden"}
      </span>
      {canReveal ? (
        <Button
          aria-describedby={statusId}
          aria-label={revealed ? "Hide sensitive value" : "Reveal sensitive value"}
          aria-pressed={revealed}
          onClick={() => setRevealed((current) => !current)}
          size="icon-comfortable"
          type="button"
          variant="ghost"
        >
          {revealed ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
        </Button>
      ) : null}
    </span>
  );
}
