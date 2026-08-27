import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import { setTheme } from "@/app/actions/theme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const options = [
  { value: "system", label: "System theme", Icon: MonitorIcon },
  { value: "light", label: "Light theme", Icon: SunIcon },
  { value: "dark", label: "Dark theme", Icon: MoonIcon },
];

export function ThemeControl({ preference = "system", showLabels = false, className }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      <div
        aria-label="Color theme"
        className="flex items-center gap-1 rounded-xl border border-border bg-card p-1 surface-shadow"
        data-slot="theme-control"
        role="group"
      >
        {options.map(({ value, label, Icon }) => {
          const selected = preference === value;
          return (
            <form action={setTheme} key={value}>
              <input name="theme" type="hidden" value={value} />
              <Button
                aria-label={label}
                aria-pressed={selected}
                className={cn(showLabels && "px-3")}
                size={showLabels ? "comfortable" : "icon-comfortable"}
                title={label}
                type="submit"
                variant={selected ? "secondary" : "ghost"}
              >
                <Icon data-icon={showLabels ? "inline-start" : undefined} />
                {showLabels ? label.replace(" theme", "") : null}
              </Button>
            </form>
          );
        })}
      </div>
      <span aria-live="polite" className="sr-only">
        Theme preference: {preference}
      </span>
    </div>
  );
}
