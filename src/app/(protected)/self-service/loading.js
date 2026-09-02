export default function SelfServiceLoading() {
  return <main aria-busy="true" aria-label="Loading employee self service" className="flex flex-col gap-6"><div className="h-10 w-2/3 animate-pulse rounded-lg bg-muted" /><div className="grid gap-5 lg:grid-cols-3"><div className="h-48 animate-pulse rounded-xl bg-muted" /><div className="h-48 animate-pulse rounded-xl bg-muted" /><div className="h-48 animate-pulse rounded-xl bg-muted" /></div></main>;
}
