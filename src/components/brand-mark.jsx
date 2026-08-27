import { ActivityIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function BrandMark({ inverse = false, className }) {
  return (
    <div className={cn("flex items-center gap-3", className)} data-slot="brand-mark">
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-xl",
          inverse ? "bg-sidebar-primary text-sidebar-primary-foreground" : "bg-primary text-primary-foreground",
        )}
      >
        <ActivityIcon aria-hidden="true" />
      </span>
      <span>
        <span className="block text-sm font-bold uppercase tracking-[0.16em]">HR Pulse</span>
        <span className={cn("block text-xs", inverse ? "text-sidebar-foreground/75" : "text-muted-foreground")}>
          People operations
        </span>
      </span>
    </div>
  );
}
