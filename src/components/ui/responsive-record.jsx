import { cn } from "@/lib/utils";

function RecordValues({ values }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {values.map(({ label, value }) => (
        <div className="min-w-0" key={label}>
          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
          <dd className="mt-1 truncate font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ResponsiveRecord({ title, priorityValues, secondaryValues, action, className }) {
  return (
    <article className={cn("rounded-xl border border-border bg-card p-4 surface-shadow", className)} data-slot="responsive-record">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{title}</h3>
          <div className="mt-3"><RecordValues values={priorityValues} /></div>
        </div>
        {action}
      </div>
      <details className="mt-4 border-t border-border pt-3 md:hidden">
        <summary className="min-h-11 cursor-pointer py-3 font-medium">View record details</summary>
        <RecordValues values={secondaryValues} />
      </details>
      <div className="mt-4 hidden border-t border-border pt-4 md:block">
        <RecordValues values={secondaryValues} />
      </div>
    </article>
  );
}
